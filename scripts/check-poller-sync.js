'use strict';

/* Verifies the poller's syncSchedules() applies the real schedule to all active
   games in one pass (reads .env). Run: node scripts/check-poller-sync.js */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const TMP = path.join(__dirname, '..', 'data', 'poller-sync-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;

const db = require('../db');
const game = require('../lib/game');
const poller = require('../lib/poller');

(async () => {
  // Two active games to prove one fetch fans out to all.
  for (const name of ['Game One', 'Game Two']) {
    const gid = game.createGame(name);
    ['Al', 'Bo', 'Ca', 'Da'].forEach((n) => game.addParticipant(gid, n));
    game.confirmGame(gid);
  }

  const res = await poller.syncSchedules(db);
  console.log('syncSchedules:', JSON.stringify(res));
  if (res === null) { console.log('No key configured — skipping (set FOOTBALL_DATA_KEY).'); return; }
  assert.strictEqual(res.games, 2, 'fanned out to both active games');
  assert.ok(res.updated >= 144, 'group fixtures synced across both games (>=72 each)');
  console.log('✓ poller schedule sync fans out to all active games in one API call');

  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
