'use strict';

/*
 * LOCAL PREVIEW ONLY — do not run against your production database.
 *
 * Injects a FULL simulated knockout bracket (Round of 32 -> Final, plus the
 * third-place match), with winners advancing round to round and every match
 * scored, into an existing local game so you can see the whole bracket view.
 *
 *   node scripts/simulate-knockout.js [gameId]          # inject + score full bracket
 *   node scripts/simulate-knockout.js [gameId] --clear  # remove simulated fixtures
 *
 * Honours DB_PATH (defaults to data/sweepstakes.db).
 */

const game = require('../lib/game');
const { applyFullBracket, clearBracket } = require('./sim-knockout-lib');

const args = process.argv.slice(2);
const clear = args.includes('--clear');
const gameId = Number(args.find((a) => /^\d+$/.test(a))) || 1;

const g = game.getGame(gameId);
if (!g) { console.error(`No game with id ${gameId}.`); process.exit(1); }
console.log(`DB: ${process.env.DB_PATH || 'data/sweepstakes.db'}  |  game #${gameId} "${g.name}" (${g.status})`);

(async () => {
  if (clear) {
    console.log(`Removed ${clearBracket(gameId)} simulated fixture(s).`);
    return;
  }
  if (g.status !== 'active') { console.error('Game must be active (confirm participants first).'); process.exit(1); }

  const res = await applyFullBracket(gameId);
  console.log(`Injected full bracket: ${res.matches} matches across ${res.rounds} rounds (R32 -> Final).`);
  console.log('Reset with:  node scripts/simulate-knockout.js ' + gameId + ' --clear');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
