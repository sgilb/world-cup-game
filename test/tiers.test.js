'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { assignTiers } = require('../lib/tiers');
const { seededTeams } = require('./helpers');

test('48 teams split into even thirds 16/16/16', () => {
  const tiered = assignTiers(require('../data/teams-2026.json').teams);
  const counts = { A: 0, B: 0, C: 0 };
  for (const t of tiered) counts[t.tier]++;
  assert.deepStrictEqual(counts, { A: 16, B: 16, C: 16 });
});

test('multipliers match tiers and the best-ranked team is tier A', () => {
  const tiered = assignTiers(require('../data/teams-2026.json').teams);
  const mult = { A: 1, B: 2, C: 3 };
  for (const t of tiered) assert.strictEqual(t.multiplier, mult[t.tier]);
  const best = tiered.reduce((a, b) => (a.fifaRank < b.fifaRank ? a : b));
  assert.strictEqual(best.tier, 'A');
  const worst = tiered.reduce((a, b) => (a.fifaRank > b.fifaRank ? a : b));
  assert.strictEqual(worst.tier, 'C');
});

test('remainder goes to weaker tiers, never to A (e.g. 50 teams -> 16/17/17)', () => {
  const fake = Array.from({ length: 50 }, (_, i) => ({ name: 't' + i, group: 'A', fifaRank: i + 1 }));
  const tiered = assignTiers(fake);
  const counts = { A: 0, B: 0, C: 0 };
  for (const t of tiered) counts[t.tier]++;
  assert.deepStrictEqual(counts, { A: 16, B: 17, C: 17 });
});
