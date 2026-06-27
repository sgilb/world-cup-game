'use strict';

/* Proves the new code upgrades an existing (pre-ext_id) DB without losing data.
   Run: node scripts/check-migration.js */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TMP = path.join(__dirname, '..', 'data', 'mig-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }

// 1. Create an OLD-schema DB (fixtures has no ext_id) with some live data.
const old = new Database(TMP);
old.exec(`
  CREATE TABLE games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT, created_at TEXT);
  CREATE TABLE fixtures (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, stage TEXT,
    group_code TEXT, matchday INTEGER, home_team TEXT, away_team TEXT, kickoff_utc TEXT,
    home_goals INTEGER, away_goals INTEGER, status TEXT DEFAULT 'scheduled',
    live_clock TEXT, winner TEXT, source TEXT DEFAULT 'api');
`);
old.prepare('INSERT INTO games (name,status,created_at) VALUES (?,?,?)').run('Live Game', 'active', 'now');
old.prepare('INSERT INTO fixtures (game_id,stage,home_team,away_team,kickoff_utc,home_goals,away_goals,status,winner,source) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run(1, 'group', 'Mexico', 'South Africa', '2026-06-11T19:00:00Z', 0, 1, 'finished', 'away', 'manual');
old.close();

// 2. Boot the NEW app DB layer against it (runs migrate-on-boot).
process.env.DB_PATH = TMP;
const db = require('../db');

// 3. Verify: ext_id added, existing rows + values intact.
const cols = db.prepare('PRAGMA table_info(fixtures)').all().map((c) => c.name);
const fx = db.prepare('SELECT * FROM fixtures').get();
console.log('ext_id column added by migration :', cols.includes('ext_id'));
console.log('existing fixture preserved       :', `${fx.home_team} ${fx.home_goals}-${fx.away_goals} ${fx.away_team} (winner=${fx.winner}, source=${fx.source})`);
console.log('game preserved                   :', db.prepare('SELECT name,status FROM games').get());

for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
