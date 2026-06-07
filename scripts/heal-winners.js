'use strict';

/* One-off: re-derive each finished fixture's winner from its score (honouring a
   legit override only on a level score). Fixes rows where a contradictory winner
   override was stored before the setManualScore fix. Run: node scripts/heal-winners.js */

const path = require('path');
const Database = require('better-sqlite3');
const { resolveWinner } = require('../lib/scoring');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sweepstakes.db');
const db = new Database(dbPath);

const finished = db.prepare("SELECT id, home_team, away_team, home_goals, away_goals, winner FROM fixtures WHERE status = 'finished'").all();
const update = db.prepare('UPDATE fixtures SET winner = ? WHERE id = ?');

let fixed = 0;
for (const f of finished) {
  const w = resolveWinner(f.home_goals, f.away_goals, f.winner);
  if (w !== f.winner) {
    console.log(`fixed #${f.id}: ${f.home_team} ${f.home_goals}-${f.away_goals} ${f.away_team}  winner ${f.winner} -> ${w}`);
    update.run(w, f.id);
    fixed++;
  }
}
console.log(fixed ? `healed ${fixed} fixture(s)` : 'no contradictory winners found');
db.close();
