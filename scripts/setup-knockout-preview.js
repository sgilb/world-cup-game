'use strict';

/* Creates a self-contained "Knockout Preview" game (4 players) with a FULL
   simulated bracket (Round of 32 -> Final) so you can browse the whole knockout
   frontend locally. Delete it afterwards from the admin UI.
   Run: node scripts/setup-knockout-preview.js */

const game = require('../lib/game');
const { applyFullBracket } = require('./sim-knockout-lib');

(async () => {
  const gid = game.createGame('Knockout Preview (delete me)');
  ['Alice', 'Bob', 'Carol', 'Dan'].forEach((n) => game.addParticipant(gid, n));
  game.confirmGame(gid); // generates group fixtures (approx times — fine for preview)

  await applyFullBracket(gid);

  console.log(`\nCreated game #${gid} "Knockout Preview" with a FULL bracket (R32 -> Final).\n`);
  console.log('Open in a browser (server already running on :3100; or run `npm start` for :3000):');
  console.log(`  Admin:  http://localhost:3100/admin/games/${gid}   (password from your .env)`);
  for (const p of game.listParticipants(gid)) {
    console.log(`  ${p.name.padEnd(6)} http://localhost:3100/p/${p.token}`);
  }
  console.log('\nWhen done, click "Delete this game" on the admin page to clean it up.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
