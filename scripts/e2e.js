'use strict';

/* Integration check against the data/service layer on a throwaway DB.
   Run: node scripts/e2e.js  */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const TMP = path.join(__dirname, '..', 'data', 'e2e-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;
process.env.ADMIN_PASSWORD = 'test123';

const db = require('../db');
const game = require('../lib/game');
const { pollOnce, inLiveWindow } = require('../lib/poller');
const { applyResultsToDb } = require('../lib/matching');

(async () => {
  // 1. Create game (seeds 48 teams with tiers).
  const gid = game.createGame('E2E Cup');
  const teams = game.listTeams(gid);
  assert.strictEqual(teams.length, 48, '48 teams seeded');
  const tierCounts = teams.reduce((a, t) => (a[t.tier]++, a), { A: 0, B: 0, C: 0 });
  assert.deepStrictEqual(tierCounts, { A: 16, B: 16, C: 16 }, 'tiers 16/16/16');

  // 2. Add 4 participants and confirm.
  const names = ['Alice', 'Bob', 'Carol', 'Dan'];
  const pids = names.map((n) => game.addParticipant(gid, n));
  const res = game.confirmGame(gid);
  assert.strictEqual(res.collisions, 0, 'no same-group collisions for 4 players');
  console.log(`✓ distributed 48 teams to 4 players, ${res.collisions} collisions`);

  const fixtures = game.listFixtures(gid);
  assert.strictEqual(fixtures.length, 72, '72 group-stage fixtures (12 groups x 6)');

  // 3. Find a fixture where two DIFFERENT participants own the two teams.
  const owner = new Map(
    game.listTeams(gid).map((t) => [t.name, t.participant_id])
  );
  const crossFixture = fixtures.find((f) => {
    const a = owner.get(f.home_team), b = owner.get(f.away_team);
    return a != null && b != null && a !== b;
  });
  assert.ok(crossFixture, 'found a fixture owned by two different participants');

  // 4. Enter a manual score (home win 2-1).
  game.setManualScore(gid, crossFixture.id, 2, 1, null);

  // 5. Participant view for the home-team owner: opponent tagging + points.
  const homeOwnerId = owner.get(crossFixture.home_team);
  const homeOwner = game.listParticipants(gid).find((p) => p.id === homeOwnerId);
  const state = game.getParticipantState(homeOwner.token);
  const fxView = state.myFixtures.find((f) => f.id === crossFixture.id);
  assert.ok(fxView, 'fixture appears in owner view');
  const mineSide = fxView.home.mine ? fxView.home : fxView.away;
  const oppSide = fxView.home.mine ? fxView.away : fxView.home;
  assert.ok(mineSide.mine && !oppSide.mine, 'my side flagged, opponent not');
  assert.ok(oppSide.ownerName && oppSide.ownerName !== homeOwner.name, 'opponent owner name shown');
  // home won 2-1: home owner earns 3 * homeTeam.multiplier
  const expected = 3 * mineSide.multiplier;
  assert.strictEqual(fxView.myPoints, fxView.home.mine ? expected : 0,
    `points = 3 x multiplier (${expected}) for the winner`);
  console.log(`✓ opponent tagged as "${oppSide.ownerName}", points=${fxView.myPoints} (x${mineSide.multiplier} tier ${mineSide.tier})`);

  // 6. League table reflects the result.
  const winnerRow = state.table.find((r) => r.participantId === homeOwnerId);
  assert.strictEqual(winnerRow.points, expected, 'table points match');
  assert.strictEqual(winnerRow.won, 1, 'one win recorded');
  console.log(`✓ league table: ${winnerRow.name} top-line ${winnerRow.points} pts`);

  // 7. Poller idle behaviour: no key configured -> does not poll.
  const pollResult = await pollOnce(db);
  assert.strictEqual(pollResult.polled, false, 'poller skips with no API key');
  console.log(`✓ poller idle: ${pollResult.reason}`);

  // 8. Live-window guard sanity (fixtures are June 2026; "now" likely outside).
  const future = new Date('2026-06-11T17:30:00Z'); // during a real MD1 slot
  assert.strictEqual(typeof inLiveWindow(fixtures, future), 'boolean');

  // 9. Manual entries survive an API upsert attempt (simulate API result).
  const apiResult = [{
    homeTeam: crossFixture.home_team, awayTeam: crossFixture.away_team,
    homeGoals: 5, awayGoals: 0, status: 'finished', winner: 'home', liveClock: null,
  }];
  const applied = applyResultsToDb(db, gid, apiResult);
  assert.strictEqual(applied.skippedManual, 1, 'API skipped the manual fixture');
  const after = game.listFixtures(gid).find((f) => f.id === crossFixture.id);
  assert.strictEqual(after.home_goals, 2, 'manual 2-1 preserved, not overwritten by API 5-0');
  console.log('✓ manual entry protected from API overwrite');

  console.log('\nAll end-to-end checks passed.');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
})().catch((err) => {
  console.error('E2E FAILED:', err.message);
  process.exit(1);
});
