'use strict';
const fs = require('fs');
const path = require('path');
const TMP = path.join(__dirname, '..', 'data', 'dbg.db');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = TMP;

const db = require('../db');
const game = require('../lib/game');
const { buildTable, pointsForTeam } = require('../lib/scoring');

const gid = game.createGame('Dbg');
['Al', 'Bo', 'Ca', 'Da'].forEach((n) => game.addParticipant(gid, n));
game.confirmGame(gid);

const teams = game.listTeams(gid);
const sa = teams.find((t) => t.name === 'South Africa');
const mx = teams.find((t) => t.name === 'Mexico');
console.log('South Africa:', { tier: sa.tier, multiplier: sa.multiplier, pid: sa.participant_id });
console.log('Mexico:', { tier: mx.tier, multiplier: mx.multiplier, pid: mx.participant_id });

// Find the Mexico v South Africa fixture.
const fx = game.listFixtures(gid).find((f) =>
  [f.home_team, f.away_team].includes('South Africa') && [f.home_team, f.away_team].includes('Mexico'));
console.log('fixture:', fx.home_team, 'v', fx.away_team, '| status', fx.status);

// Score it so South Africa wins (figure out which side SA is).
const saHome = fx.home_team === 'South Africa';
const hg = saHome ? 2 : 0;
const ag = saHome ? 0 : 2;
game.setManualScore(gid, fx.id, hg, ag, null);
const after = game.listFixtures(gid).find((f) => f.id === fx.id);
console.log('after score:', after.home_team, after.home_goals, '-', after.away_goals, after.away_team, '| winner:', after.winner);

console.log('pointsForTeam(SA, mult=3):', pointsForTeam(after, 'South Africa', sa.multiplier));

const table = buildTable(game.listParticipants(gid), teams, game.listFixtures(gid));
const saOwner = table.find((r) => r.participantId === sa.participant_id);
console.log('SA owner row:', { name: saOwner.name, played: saOwner.played, won: saOwner.won, drawn: saOwner.drawn, points: saOwner.points });

for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch {} }
