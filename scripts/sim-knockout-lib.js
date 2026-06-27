'use strict';

/* Shared simulation helper: build a FULL knockout bracket (R32 -> Final, plus
   third-place) for a game, with winners advancing round to round, and apply it
   via the real syncSchedule + setManualScore paths. LOCAL PREVIEW ONLY. */

const db = require('../db');
const game = require('../lib/game');

/** 32 teams ordered so adjacent picks come from different groups. */
function crossGroupPool(teams) {
  const byGroup = new Map();
  for (const t of teams) {
    if (!byGroup.has(t.group_code)) byGroup.set(t.group_code, []);
    byGroup.get(t.group_code).push(t);
  }
  const groups = [...byGroup.keys()].sort();
  const out = [];
  for (let i = 0; out.length < teams.length; i++) {
    for (const g of groups) if (byGroup.get(g)[i]) out.push(byGroup.get(g)[i]);
  }
  return out.slice(0, 32);
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * Build the full bracket and apply it to the game. Every match is scored so the
 * bracket is populated end to end (champion crowned), with occasional upsets.
 * @param {number} gameId
 * @param {{finishFinal?: boolean}} [opts]  set finishFinal=false to leave the Final unscored
 * @returns {Promise<{matches:number, rounds:number}>}
 */
async function applyFullBracket(gameId, opts = {}) {
  const finishFinal = opts.finishFinal !== false;
  const pool = crossGroupPool(game.listTeams(gameId));
  if (pool.length < 32) throw new Error('need an active game with 48 assigned teams');

  const fixtures = []; // for syncSchedule (schedule/teams)
  const scores = [];   // {extId, hg, ag}
  const sfLosers = [];

  // Play one round: pair teamsIn[2i],[2i+1], decide a winner (better FIFA rank,
  // with an upset every 4th match), return the winners in order.
  function playRound(stage, teamsIn, startMs, gapH, { score = true } = {}) {
    const winners = [];
    for (let i = 0; i < teamsIn.length; i += 2) {
      const idx = i / 2;
      const home = teamsIn[i], away = teamsIn[i + 1];
      let winnerIsHome = home.fifa_rank <= away.fifa_rank;
      if (idx % 4 === 3) winnerIsHome = !winnerIsHome; // sprinkle in upsets
      const extId = `sim-${stage}-${idx}`;
      fixtures.push({
        extId, stage, group: null, matchday: null,
        homeTeam: home.name, awayTeam: away.name,
        kickoff: iso(startMs + idx * gapH * 3600 * 1000),
      });
      if (score) scores.push({ extId, hg: winnerIsHome ? 2 : 0, ag: winnerIsHome ? 0 : 2 });
      winners.push(winnerIsHome ? home : away);
      if (stage === 'SEMI_FINALS') sfLosers.push(winnerIsHome ? away : home);
    }
    return winners;
  }

  let w = playRound('LAST_32', pool, Date.parse('2026-06-28T16:00:00Z'), 4);
  w = playRound('LAST_16', w, Date.parse('2026-07-04T16:00:00Z'), 6);
  w = playRound('QUARTER_FINALS', w, Date.parse('2026-07-09T16:00:00Z'), 12);
  w = playRound('SEMI_FINALS', w, Date.parse('2026-07-14T19:00:00Z'), 24);
  playRound('THIRD_PLACE', sfLosers, Date.parse('2026-07-18T16:00:00Z'), 0);
  playRound('FINAL', w, Date.parse('2026-07-19T19:00:00Z'), 0, { score: finishFinal });

  await game.syncSchedule(gameId, { fixtures });

  const byExt = new Map(
    game.listFixtures(gameId).filter((f) => f.ext_id).map((f) => [f.ext_id, f])
  );
  for (const s of scores) {
    const fx = byExt.get(s.extId);
    if (fx) game.setManualScore(gameId, fx.id, s.hg, s.ag, null);
  }

  return { matches: fixtures.length, rounds: 6 };
}

function clearBracket(gameId) {
  return db.prepare("DELETE FROM fixtures WHERE game_id = ? AND ext_id LIKE 'sim-%'").run(gameId).changes;
}

module.exports = { applyFullBracket, clearBracket };
