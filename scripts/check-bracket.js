'use strict';

/* Verifies knockoutBracket() data + renders the bracket partial. Run: node scripts/check-bracket.js */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const ejs = require('ejs');

const TMP = path.join(__dirname, '..', 'data', 'bracket-test.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;

const game = require('../lib/game');

(async () => {
  const gid = game.createGame('Bracket Test');
  ['Alice', 'Bob', 'Carol', 'Dan'].forEach((n) => game.addParticipant(gid, n));
  game.confirmGame(gid);
  const t = game.listTeams(gid).map((x) => x.name);

  // Inject three rounds (out of order in the array, to test round sorting).
  const ko = [
    { extId: 'k-fin', stage: 'FINAL', homeTeam: t[0], awayTeam: t[2], kickoff: '2026-07-19T19:00:00Z' },
    { extId: 'k-32-1', stage: 'LAST_32', homeTeam: t[0], awayTeam: t[1], kickoff: '2026-06-30T16:00:00Z' },
    { extId: 'k-32-2', stage: 'LAST_32', homeTeam: t[2], awayTeam: t[3], kickoff: '2026-06-30T20:00:00Z' },
    { extId: 'k-16-1', stage: 'LAST_16', homeTeam: t[0], awayTeam: t[2], kickoff: '2026-07-05T16:00:00Z' },
  ];
  await game.syncSchedule(gid, { fixtures: ko });

  // Score one R32 match (home win).
  const r32 = game.listFixtures(gid).find((f) => f.ext_id === 'k-32-1');
  game.setManualScore(gid, r32.id, 2, 0, null);

  const rounds = game.knockoutBracket(gid);
  console.log('rounds:', rounds.map((r) => `${r.stage}(${r.matches.length})`).join(' -> '));
  assert.deepStrictEqual(rounds.map((r) => r.stage), ['Round of 32', 'Round of 16', 'Final'], 'rounds in bracket order');
  assert.strictEqual(rounds[0].matches.length, 2, 'two R32 matches');

  const scored = rounds[0].matches.find((m) => m.home.team === t[0]);
  assert.strictEqual(scored.winner, 'home');
  assert.strictEqual(scored.home.goals, 2);
  assert.ok(scored.home.ownerName, 'home side has an owner name');
  console.log(`R32 sample: ${scored.home.team} (${scored.home.ownerName}) ${scored.home.goals}-${scored.away.goals} ${scored.away.team} (${scored.away.ownerName}) winner=${scored.winner}`);

  // Render the partial (stub flag()), highlight Alice's teams.
  const aliceTeams = game.getParticipantState(game.listParticipants(gid)[0].token).myTeams.map((x) => x.name);
  const flag = (n) => (n ? `<img class="flag" alt="${n}">` : '');
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'bracket.ejs'),
    { rounds, mine: aliceTeams, flag });

  assert.ok(html.includes('bracket-round') && html.includes('Round of 32') && html.includes('Final'), 'round headers render');
  assert.ok(html.includes('class="flag"'), 'flags render in bracket');
  assert.ok(html.includes('bm-owner'), 'owner names render');
  assert.ok(html.includes('bm-side won'), 'winner side highlighted');
  assert.ok(html.includes('bm-side  mine') || /bm-side[^"]*mine/.test(html), 'participant teams highlighted');
  console.log('✓ bracket partial renders with flags, owners, winner + mine highlighting');

  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
