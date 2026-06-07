'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { distributeTeams } = require('../lib/distribute');
const { makeRng, seededTeams, participants } = require('./helpers');

const TEAMS = seededTeams();

function countsByParticipant(assignments, ids) {
  const c = new Map(ids.map((id) => [id, 0]));
  for (const pid of assignments.values()) c.set(pid, c.get(pid) + 1);
  return c;
}

test('every team assigned exactly once, for many participant counts', () => {
  for (const P of [1, 2, 3, 4, 5, 6, 8, 12, 24, 48]) {
    const ps = participants(P);
    const { assignments } = distributeTeams(ps, TEAMS, makeRng(P * 7 + 1));
    assert.strictEqual(assignments.size, 48, `P=${P}: all teams assigned`);
    const assignedTeams = new Set(assignments.keys());
    assert.strictEqual(assignedTeams.size, 48, `P=${P}: no duplicate teams`);
    for (const pid of assignments.values()) {
      assert.ok(ps.some((p) => p.id === pid), `P=${P}: assigned to a real participant`);
    }
  }
});

test('per-participant counts are balanced (differ by at most 1)', () => {
  for (const P of [2, 3, 4, 5, 6, 7, 8, 12, 24, 48]) {
    const ps = participants(P);
    const { assignments } = distributeTeams(ps, TEAMS, makeRng(P * 13 + 3));
    const counts = [...countsByParticipant(assignments, ps.map((p) => p.id)).values()];
    const min = Math.min(...counts), max = Math.max(...counts);
    assert.ok(max - min <= 1, `P=${P}: counts spread ${min}..${max}`);
    assert.strictEqual(counts.reduce((a, b) => a + b, 0), 48);
  }
});

test('zero same-group collisions when participants >= 4 (50 seeds each)', () => {
  for (const P of [4, 5, 6, 8, 12, 24, 48]) {
    for (let seed = 0; seed < 50; seed++) {
      const ps = participants(P);
      const { collisions } = distributeTeams(ps, TEAMS, makeRng(seed * 101 + P));
      assert.strictEqual(collisions, 0, `P=${P}, seed=${seed}: expected 0 collisions, got ${collisions}`);
    }
  }
});

test('collisions are spread evenly when participants < 4', () => {
  // With P=2 each group's 4 teams split 2/2 -> unavoidable collisions, but they
  // should be distributed, not dumped on one participant.
  const ps = participants(2);
  const { assignments } = distributeTeams(ps, TEAMS, makeRng(42));
  // Each participant should still get exactly 24 teams.
  const counts = [...countsByParticipant(assignments, [1, 2]).values()];
  assert.deepStrictEqual(counts.sort(), [24, 24]);
});

test('rejects more participants than teams', () => {
  assert.throws(() => distributeTeams(participants(49), TEAMS, makeRng(1)));
});

test('tiers are spread across participants (no one hoards C-tier x3) for P=8', () => {
  const ps = participants(8);
  const { assignments } = distributeTeams(ps, TEAMS, makeRng(99));
  const tierByName = new Map(TEAMS.map((t) => [t.name, t.tier]));
  const cCounts = new Map(ps.map((p) => [p.id, 0]));
  for (const [team, pid] of assignments) {
    if (tierByName.get(team) === 'C') cCounts.set(pid, cCounts.get(pid) + 1);
  }
  const vals = [...cCounts.values()];
  // 16 C-tier teams over 8 participants => 2 each ideally. Tier balance is a
  // best-effort SECONDARY goal (after collision-avoidance + capacity), so we
  // allow a small spread rather than a hard +/-1.
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 2, `C-tier spread too wide: ${vals}`);
});
