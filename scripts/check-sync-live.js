'use strict';

/* Live test of syncSchedule against the real API (reads .env).
   Verifies real kickoff times land on our seed-named fixtures.
   Run: node scripts/check-sync-live.js */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const TMP = path.join(__dirname, '..', 'data', 'sync-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;

const game = require('../lib/game');

(async () => {
  const gid = game.createGame('Sync Cup');
  ['Alice', 'Bob', 'Carol', 'Dan'].forEach((n) => game.addParticipant(gid, n));
  game.confirmGame(gid); // generates approximate fixtures

  const before = game.listFixtures(gid);
  const sync = await game.syncSchedule(gid);
  console.log(`group ${sync.groupSynced}, knockout +${sync.knockoutAdded}/~${sync.knockoutUpdated}, pending ${sync.pending}, unmatched ${sync.unmatched.length}, total ${sync.total}`);
  assert.strictEqual(sync.groupSynced, 72, 'all 72 group fixtures got real times');
  assert.strictEqual(sync.unmatched.length, 0, 'no unmatched fixtures');

  const after = game.listFixtures(gid);
  // Every fixture still references a real seed team that maps to a participant.
  const teams = game.listTeams(gid);
  const owned = new Set(teams.filter((t) => t.participant_id != null).map((t) => t.name));
  for (const f of after) {
    assert.ok(owned.has(f.home_team) && owned.has(f.away_team),
      `fixture teams still seed-named & owned: ${f.home_team} v ${f.away_team}`);
  }

  // Kickoffs should now be real WC dates, and the earliest is the opener.
  const sorted = [...after].sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
  const first = sorted[0];
  console.log('earliest fixture:', first.kickoff_utc, '|', first.home_team, 'v', first.away_team, '| MD' + first.matchday, 'Grp' + first.group_code);
  assert.ok(first.kickoff_utc.startsWith('2026-06-11'), 'opener is on 2026-06-11');
  assert.ok(after.every((f) => /^2026-0[67]-/.test(f.kickoff_utc)), 'all kickoffs in Jun/Jul 2026');
  // Orientation now matches the real API: opener is Mexico (home) v South Africa.
  assert.strictEqual(first.home_team, 'Mexico', 'opener home team aligned to real API');
  assert.strictEqual(first.away_team, 'South Africa', 'opener away team aligned to real API');

  // Sanity: the schedule actually changed vs the generated approximations.
  const changed = after.filter((f, i) => f.kickoff_utc !== before.find((b) => b.id === f.id).kickoff_utc).length;
  console.log(`kickoff times updated on ${changed}/72 fixtures`);
  assert.ok(changed > 0, 'sync changed some kickoff times');

  console.log('\nLive schedule-sync checks passed. ✅');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
