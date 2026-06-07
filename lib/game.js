'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const db = require('../db');
const { assignTiers } = require('./tiers');
const { generateGroupFixtures } = require('./fixtures');
const { distributeTeams } = require('./distribute');
const { buildTable, pointsForTeam, resolveWinner } = require('./scoring');
const { canonicalKey, pairKey } = require('./matching');
const resultsApi = require('./results-api');

const SEED = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'teams-2026.json'), 'utf8')
);

function newToken() {
  return crypto.randomBytes(16).toString('hex'); // 32 hex chars
}

// ---- Setup phase ----

/** Create a game in 'setup' status, seeding its 48 teams with computed tiers. */
function createGame(name) {
  const created = new Date().toISOString();
  const insertGame = db.prepare('INSERT INTO games (name, status, created_at) VALUES (?, ?, ?)');
  const insertTeam = db.prepare(`
    INSERT INTO teams (game_id, name, group_code, fifa_rank, tier, multiplier)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tiered = assignTiers(SEED.teams);

  const tx = db.transaction(() => {
    const gameId = insertGame.run(name, 'setup', created).lastInsertRowid;
    for (const t of tiered) {
      insertTeam.run(gameId, t.name, t.group, t.fifaRank, t.tier, t.multiplier);
    }
    return gameId;
  });
  return tx();
}

function getGame(gameId) {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
}

function addParticipant(gameId, name) {
  return db
    .prepare('INSERT INTO participants (game_id, name, token) VALUES (?, ?, ?)')
    .run(gameId, name.trim(), newToken()).lastInsertRowid;
}

function removeParticipant(gameId, participantId) {
  db.prepare('DELETE FROM participants WHERE id = ? AND game_id = ?').run(participantId, gameId);
}

function listParticipants(gameId) {
  return db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(gameId);
}

function listTeams(gameId) {
  return db.prepare('SELECT * FROM teams WHERE game_id = ? ORDER BY group_code, fifa_rank').all(gameId);
}

function listFixtures(gameId) {
  return db
    .prepare('SELECT * FROM fixtures WHERE game_id = ? ORDER BY kickoff_utc, id')
    .all(gameId);
}

/** Confirm participants: distribute teams, generate fixtures, go 'active'. */
function confirmGame(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status === 'active') throw new Error('Game already active');

  const participants = listParticipants(gameId);
  if (participants.length < 1) throw new Error('Add at least one participant first');

  const teams = listTeams(gameId);
  const distInput = teams.map((t) => ({ name: t.name, group: t.group_code, tier: t.tier }));
  const { assignments, collisions } = distributeTeams(participants, distInput);

  const updateTeam = db.prepare('UPDATE teams SET participant_id = ? WHERE id = ?');
  const insertFixture = db.prepare(`
    INSERT INTO fixtures (game_id, stage, group_code, matchday, home_team, away_team, kickoff_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const fixtures = generateGroupFixtures(
    teams.map((t) => ({ name: t.name, group: t.group_code }))
  );

  const tx = db.transaction(() => {
    for (const t of teams) {
      const pid = assignments.get(t.name);
      updateTeam.run(pid, t.id);
    }
    for (const f of fixtures) {
      insertFixture.run(gameId, f.stage, f.group_code, f.matchday, f.home_team, f.away_team, f.kickoff_utc);
    }
    db.prepare('UPDATE games SET status = ? WHERE id = ?').run('active', gameId);
  });
  tx();

  return { collisions, teamCount: teams.length, participantCount: participants.length };
}

// ---- Real fixture schedule sync ----

const STAGE_MAP = {
  GROUP_STAGE: 'group',
  LAST_32: 'Round of 32', LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-final', SEMI_FINALS: 'Semi-final',
  THIRD_PLACE: 'Third place', FINAL: 'Final',
};

/**
 * Sync this game's fixtures from the provider's real schedule:
 *
 *  - GROUP STAGE: overlay real kickoff/matchday onto the fixtures we generated
 *    at confirm, matched by canonical team-pair so our seed team names (which
 *    carry participant assignments + tiers) are preserved.
 *  - KNOCKOUT: the bracket auto-populates here. Knockout fixtures are absent
 *    until their teams are decided; once the provider reports both teams (it
 *    handles the 8-best-third-placed logic and bracket pairing), we INSERT the
 *    fixture, keyed by the provider's stable match id (ext_id) so re-syncs
 *    update rather than duplicate.
 *
 * Team names are always mapped back to our seed names (alias-aware), so the
 * team<->participant link holds. Scores are never set here — the poller owns
 * those (it matches knockout fixtures by team-pair once they exist). Orientation
 * is only (re)set while a fixture is unscored, so a stored winner is never
 * inverted.
 *
 * @param {number} gameId
 * @param {{fixtures?: Array}} [opts]  inject fixtures (tests); defaults to provider fetch
 * @returns {Promise<{groupSynced, knockoutAdded, knockoutUpdated, pending, unmatched, total}>}
 */
async function syncSchedule(gameId, opts = {}) {
  const apiFixtures = opts.fixtures || await resultsApi.fetchFixtures();
  if (!apiFixtures.length) {
    return { groupSynced: 0, knockoutAdded: 0, knockoutUpdated: 0, pending: 0, unmatched: [], total: 0, reason: 'no fixtures from provider' };
  }

  const teams = listTeams(gameId);
  const seedByCanonical = new Map(teams.map((t) => [canonicalKey(t.name), t.name]));
  const fixtures = listFixtures(gameId);
  const fixtureByPair = new Map(fixtures.map((f) => [pairKey(f.home_team, f.away_team), f]));
  const fixtureByExt = new Map(fixtures.filter((f) => f.ext_id).map((f) => [String(f.ext_id), f]));

  const update = db.prepare(
    'UPDATE fixtures SET kickoff_utc = ?, matchday = ?, stage = ?, group_code = ?, home_team = ?, away_team = ?, ext_id = ? WHERE id = ?'
  );
  const insert = db.prepare(`
    INSERT INTO fixtures (game_id, stage, group_code, matchday, home_team, away_team, kickoff_utc, status, ext_id)
    VALUES (?, ?, NULL, NULL, ?, ?, ?, 'scheduled', ?)
  `);

  let groupSynced = 0, knockoutAdded = 0, knockoutUpdated = 0, pending = 0;
  const unmatched = [];

  const tx = db.transaction(() => {
    for (const af of apiFixtures) {
      const stage = STAGE_MAP[af.stage] || af.stage || 'group';
      const isGroup = stage === 'group';

      // Knockout slot whose teams aren't decided yet.
      if (!af.homeTeam || !af.awayTeam) { if (!isGroup) pending++; continue; }

      const home = seedByCanonical.get(canonicalKey(af.homeTeam));
      const away = seedByCanonical.get(canonicalKey(af.awayTeam));
      if (!home || !away) {
        // Group teams must map (validated); a knockout team that doesn't map is
        // just not in our pool (shouldn't happen for the WC) — report it.
        unmatched.push(`${af.homeTeam} v ${af.awayTeam}`);
        if (!isGroup) pending++;
        continue;
      }

      const extId = af.extId != null ? String(af.extId) : null;
      // Find an existing local fixture: group by pair, knockout by ext_id (then pair).
      const existing = isGroup
        ? fixtureByPair.get(pairKey(home, away))
        : (extId && fixtureByExt.get(extId)) || fixtureByPair.get(pairKey(home, away));

      if (existing) {
        // Re-orient/re-team only while unscored; always refresh kickoff/stage.
        const [h, a] = existing.status === 'scheduled' ? [home, away] : [existing.home_team, existing.away_team];
        const group = isGroup ? (af.group ? af.group.replace(/^GROUP_/, '') : existing.group_code) : null;
        update.run(af.kickoff || existing.kickoff_utc, af.matchday ?? existing.matchday, stage, group, h, a, extId, existing.id);
        if (isGroup) groupSynced++; else knockoutUpdated++;
      } else if (!isGroup) {
        insert.run(gameId, stage, home, away, af.kickoff, extId);
        knockoutAdded++;
      } else {
        unmatched.push(`${home} v ${away} (no local group fixture)`);
      }
    }
  });
  tx();

  return {
    groupSynced, knockoutAdded, knockoutUpdated, pending, unmatched,
    total: apiFixtures.length,
  };
}

// ---- Manual score entry ----

function setManualScore(gameId, fixtureId, homeGoals, awayGoals, winner) {
  const fx = db.prepare('SELECT * FROM fixtures WHERE id = ? AND game_id = ?').get(fixtureId, gameId);
  if (!fx) throw new Error('Fixture not found');
  // Winner follows the goals for any decisive score. The `winner` override is
  // ONLY honoured to break a level score (extra-time / penalty winner) — it can
  // never contradict a decisive result.
  const w = resolveWinner(homeGoals, awayGoals, winner);
  db.prepare(`
    UPDATE fixtures
       SET home_goals = ?, away_goals = ?, status = 'finished', winner = ?, live_clock = NULL, source = 'manual'
     WHERE id = ?
  `).run(homeGoals, awayGoals, w, fixtureId);
}

function clearScore(gameId, fixtureId) {
  db.prepare(`
    UPDATE fixtures
       SET home_goals = NULL, away_goals = NULL, status = 'scheduled', winner = NULL, live_clock = NULL, source = 'api'
     WHERE id = ? AND game_id = ?
  `).run(fixtureId, gameId);
}

// ---- Views ----

function getParticipantByToken(token) {
  return db.prepare('SELECT * FROM participants WHERE token = ?').get(token);
}

/** Map team name -> owning participant {id,name} for a game. */
function ownerMap(gameId) {
  const rows = db.prepare(`
    SELECT t.name AS team, t.tier, t.multiplier, p.id AS pid, p.name AS pname
      FROM teams t LEFT JOIN participants p ON p.id = t.participant_id
     WHERE t.game_id = ?
  `).all(gameId);
  const m = new Map();
  for (const r of rows) {
    m.set(r.team, { tier: r.tier, multiplier: r.multiplier, ownerId: r.pid, ownerName: r.pname });
  }
  return m;
}

/** Full state for a participant link: my teams, my fixtures (tagged), league table. */
function getParticipantState(token) {
  const me = getParticipantByToken(token);
  if (!me) return null;
  const game = getGame(me.game_id);
  const teams = listTeams(me.game_id);
  const participants = listParticipants(me.game_id);
  const fixtures = listFixtures(me.game_id);
  const owners = ownerMap(me.game_id);

  const myTeamNames = new Set(
    teams.filter((t) => t.participant_id === me.id).map((t) => t.name)
  );

  const myTeams = teams
    .filter((t) => t.participant_id === me.id)
    .map((t) => ({ name: t.name, group: t.group_code, tier: t.tier, multiplier: t.multiplier, fifaRank: t.fifa_rank }));

  const side = (teamName) => {
    const info = owners.get(teamName) || {};
    return {
      team: teamName,
      tier: info.tier,
      multiplier: info.multiplier,
      ownerId: info.ownerId ?? null,
      ownerName: info.ownerName ?? null,
      mine: myTeamNames.has(teamName),
    };
  };

  const myFixtures = fixtures
    .filter((fx) => myTeamNames.has(fx.home_team) || myTeamNames.has(fx.away_team))
    .map((fx) => {
      const home = { ...side(fx.home_team), goals: fx.home_goals };
      const away = { ...side(fx.away_team), goals: fx.away_goals };
      let myPoints = null;
      if (fx.status === 'finished') {
        myPoints = 0;
        for (const s of [home, away]) {
          if (s.mine) myPoints += pointsForTeam(fx, s.team, s.multiplier) ?? 0;
        }
      }
      return {
        id: fx.id, stage: fx.stage, group: fx.group_code, matchday: fx.matchday,
        kickoff: fx.kickoff_utc, status: fx.status, winner: fx.winner, liveClock: fx.live_clock,
        home, away, myPoints,
        ownVsOwn: home.mine && away.mine,
      };
    });

  const table = buildTable(participants, teams, fixtures);

  return { me, game, myTeams, myFixtures, table };
}

/** State for the admin dashboard of one game. */
function getAdminState(gameId) {
  const game = getGame(gameId);
  if (!game) return null;
  const participants = listParticipants(gameId);
  const teams = listTeams(gameId);
  const fixtures = listFixtures(gameId);
  const owners = ownerMap(gameId);
  const table = game.status === 'active' ? buildTable(participants, teams, fixtures) : [];

  // Teams grouped by participant (for the "assignments" view).
  const byParticipant = participants.map((p) => ({
    ...p,
    teams: teams.filter((t) => t.participant_id === p.id)
      .map((t) => ({ name: t.name, group: t.group_code, tier: t.tier, multiplier: t.multiplier })),
  }));

  return { game, participants, byParticipant, teams, fixtures, owners, table };
}

function listGames() {
  return db.prepare('SELECT * FROM games ORDER BY id DESC').all();
}

/** Permanently delete a game and (via ON DELETE CASCADE) its participants,
 *  teams and fixtures. Returns true if a game was deleted. */
function deleteGame(gameId) {
  const info = db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
  return info.changes > 0;
}

module.exports = {
  createGame, getGame, listGames,
  addParticipant, removeParticipant, listParticipants,
  listTeams, listFixtures, confirmGame, syncSchedule,
  setManualScore, clearScore,
  getParticipantByToken, getParticipantState, getAdminState,
};
