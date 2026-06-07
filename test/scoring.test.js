'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildTable, pointsForTeam, basePointsFor, resolveWinner } = require('../lib/scoring');

const participants = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
// Alice owns an A-tier (x1) and a C-tier (x3) team; Bob owns a B-tier (x2) team.
const teams = [
  { name: 'France', participant_id: 1, multiplier: 1 },   // A
  { name: 'Haiti', participant_id: 1, multiplier: 3 },    // C
  { name: 'Japan', participant_id: 2, multiplier: 2 },    // B
];

test('resolveWinner: decisive scores follow the goals, ignoring any override', () => {
  assert.strictEqual(resolveWinner(2, 0, null), 'home');
  assert.strictEqual(resolveWinner(0, 1, null), 'away');
  // A contradictory override on a decisive score is IGNORED (the reported bug:
  // 0-1 with a 'home' override must NOT credit the home team).
  assert.strictEqual(resolveWinner(0, 1, 'home'), 'away');
  assert.strictEqual(resolveWinner(2, 0, 'away'), 'home');
});

test('resolveWinner: override only breaks a level score (ET/pens)', () => {
  assert.strictEqual(resolveWinner(1, 1, null), 'draw');
  assert.strictEqual(resolveWinner(1, 1, 'home'), 'home');
  assert.strictEqual(resolveWinner(1, 1, 'away'), 'away');
  assert.strictEqual(resolveWinner(0, 0, 'draw'), 'draw');
});

test('base points: win 3 / draw 1 / loss 0', () => {
  assert.deepStrictEqual(basePointsFor('home'), { home: 3, away: 0 });
  assert.deepStrictEqual(basePointsFor('away'), { home: 0, away: 3 });
  assert.deepStrictEqual(basePointsFor('draw'), { home: 1, away: 1 });
});

test('pointsForTeam applies the multiplier', () => {
  const fx = { status: 'finished', winner: 'away', home_team: 'France', away_team: 'Haiti', home_goals: 0, away_goals: 1 };
  assert.strictEqual(pointsForTeam(fx, 'France', 1), 0);  // loss
  assert.strictEqual(pointsForTeam(fx, 'Haiti', 3), 9);   // win x3
  assert.strictEqual(pointsForTeam(fx, 'Japan', 2), null); // not in fixture
});

test('unfinished fixtures yield no points', () => {
  const fx = { status: 'live', winner: null, home_team: 'France', away_team: 'Haiti' };
  assert.strictEqual(pointsForTeam(fx, 'France', 1), null);
});

test('buildTable aggregates points, multipliers and ordering', () => {
  const fixtures = [
    // Haiti (Alice, x3) beats Japan (Bob, x2): Alice +9, Bob +0
    { status: 'finished', winner: 'home', home_team: 'Haiti', away_team: 'Japan', home_goals: 2, away_goals: 1 },
    // France (Alice, x1) draws Japan (Bob, x2): Alice +1, Bob +2
    { status: 'finished', winner: 'draw', home_team: 'France', away_team: 'Japan', home_goals: 0, away_goals: 0 },
    // scheduled - ignored
    { status: 'scheduled', winner: null, home_team: 'France', away_team: 'Haiti', home_goals: null, away_goals: null },
  ];
  const table = buildTable(participants, teams, fixtures);
  const alice = table.find((r) => r.name === 'Alice');
  const bob = table.find((r) => r.name === 'Bob');

  assert.strictEqual(alice.points, 10); // 9 + 1
  assert.strictEqual(bob.points, 2);    // 0 + 2
  assert.strictEqual(alice.played, 2);
  assert.strictEqual(bob.played, 2);
  assert.strictEqual(alice.won, 1);
  assert.strictEqual(bob.drawn, 1);
  assert.strictEqual(table[0].name, 'Alice'); // sorted by points desc
  assert.strictEqual(table[0].position, 1);
});
