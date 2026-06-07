'use strict';

/* Tests knockout auto-population via injected provider fixtures (the real API
   still has knockout teams as TBD pre-tournament). Run: node scripts/check-knockout.js */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const TMP = path.join(__dirname, '..', 'data', 'ko-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;

const db = require('../db');
const game = require('../lib/game');
const { applyResultsToDb } = require('../lib/matching');

(async () => {
  const gid = game.createGame('KO Cup');
  ['Alice', 'Bob', 'Carol', 'Dan'].forEach((n) => game.addParticipant(gid, n));
  game.confirmGame(gid);
  const baseCount = game.listFixtures(gid).length;
  assert.strictEqual(baseCount, 72, '72 group fixtures generated');

  // Injected knockout schedule: one determined R16 + one undecided Final.
  const koFixtures = [
    { extId: 'ko-1', stage: 'LAST_16', group: null, matchday: null, homeTeam: 'Mexico', awayTeam: 'France', kickoff: '2026-07-04T16:00:00Z' },
    { extId: 'ko-final', stage: 'FINAL', group: null, matchday: null, homeTeam: null, awayTeam: null, kickoff: '2026-07-19T19:00:00Z' },
  ];

  let r = await game.syncSchedule(gid, { fixtures: koFixtures });
  console.log('sync1:', JSON.stringify(r));
  assert.strictEqual(r.knockoutAdded, 1, 'one knockout fixture inserted');
  assert.strictEqual(r.pending, 1, 'undecided final counted as pending');

  let all = game.listFixtures(gid);
  const ko = all.find((f) => f.ext_id === 'ko-1');
  assert.ok(ko, 'knockout fixture present');
  assert.strictEqual(ko.stage, 'Round of 16');
  assert.strictEqual(ko.status, 'scheduled');
  assert.strictEqual(ko.group_code, null);
  assert.strictEqual(all.length, baseCount + 1, 'exactly one fixture added');
  console.log(`✓ inserted R16: ${ko.home_team} v ${ko.away_team} @ ${ko.kickoff_utc}`);

  // Re-sync must UPDATE (by ext_id), not duplicate.
  r = await game.syncSchedule(gid, { fixtures: koFixtures });
  console.log('sync2:', JSON.stringify(r));
  assert.strictEqual(r.knockoutAdded, 0, 're-sync adds nothing');
  assert.strictEqual(r.knockoutUpdated, 1, 're-sync updates existing by ext_id');
  assert.strictEqual(game.listFixtures(gid).length, baseCount + 1, 'no duplicate fixture');
  console.log('✓ re-sync idempotent (no duplicate)');

  // Poller scores the knockout by team-pair; it then counts in the league table.
  applyResultsToDb(db, gid, [{
    homeTeam: 'Mexico', awayTeam: 'France', homeGoals: 1, awayGoals: 1,
    status: 'finished', winner: 'away', liveClock: null, // France win (e.g. on pens)
  }]);
  const scored = game.listFixtures(gid).find((f) => f.ext_id === 'ko-1');
  assert.strictEqual(scored.status, 'finished');
  assert.strictEqual(scored.winner, 'away');
  console.log('✓ knockout scored via poller path (France win on pens counts as a win)');

  // France's owner should have earned points from the knockout in the table.
  const franceOwnerId = game.listTeams(gid).find((t) => t.name === 'France').participant_id;
  const franceOwner = game.listParticipants(gid).find((p) => p.id === franceOwnerId);
  const state = game.getParticipantState(franceOwner.token);
  const koView = state.myFixtures.find((f) => f.id === scored.id);
  assert.ok(koView, 'knockout fixture appears in owner view');
  assert.ok(koView.myPoints > 0, `owner earned knockout points (${koView.myPoints})`);
  console.log(`✓ ${franceOwner.name} earned ${koView.myPoints} pts from the R16 (France tier x${koView.home.mine ? koView.home.multiplier : koView.away.multiplier})`);

  console.log('\nKnockout auto-population checks passed. ✅');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
