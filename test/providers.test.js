'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fd = require('../lib/providers/football-data');

test('football-data: status mapping', () => {
  assert.strictEqual(fd.mapStatus('FINISHED'), 'finished');
  assert.strictEqual(fd.mapStatus('AWARDED'), 'finished');
  assert.strictEqual(fd.mapStatus('IN_PLAY'), 'live');
  assert.strictEqual(fd.mapStatus('PAUSED'), 'live');
  assert.strictEqual(fd.mapStatus('TIMED'), 'scheduled');
  assert.strictEqual(fd.mapStatus('SCHEDULED'), 'scheduled');
});

test('football-data: normalize a finished match (home win)', () => {
  const n = fd.normalize({
    status: 'FINISHED',
    utcDate: '2026-06-13T16:00:00Z',
    homeTeam: { name: 'Brazil' },
    awayTeam: { name: 'Scotland' },
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 1 } },
  });
  assert.deepStrictEqual(n, {
    homeTeam: 'Brazil', awayTeam: 'Scotland',
    homeGoals: 2, awayGoals: 1,
    status: 'finished', winner: 'home', liveClock: null,
    kickoff: '2026-06-13T16:00:00Z',
  });
});

test('football-data: penalty-shootout winner is treated as a win', () => {
  const n = fd.normalize({
    status: 'FINISHED',
    homeTeam: { name: 'Spain' }, awayTeam: { name: 'Uruguay' },
    score: { winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT', fullTime: { home: 1, away: 1 } },
  });
  assert.strictEqual(n.winner, 'away');
  assert.strictEqual(n.status, 'finished');
});

test('football-data: penalty-shootout goals are stripped from the score', () => {
  // 1-1 after extra time, home wins 4-2 on penalties. football-data bakes the
  // shoot-out into fullTime (5-3); we keep the level end-of-ET score and let the
  // winner carry the result.
  const n = fd.normalize({
    status: 'FINISHED',
    homeTeam: { name: 'Spain' }, awayTeam: { name: 'Uruguay' },
    score: {
      winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 5, away: 3 }, penalties: { home: 4, away: 2 },
    },
  });
  assert.strictEqual(n.homeGoals, 1);
  assert.strictEqual(n.awayGoals, 1);
  assert.strictEqual(n.winner, 'home');
});

test('football-data: draw and scheduled have no/null winner', () => {
  const draw = fd.normalize({ status: 'FINISHED', homeTeam: {}, awayTeam: {}, score: { winner: 'DRAW', fullTime: { home: 0, away: 0 } } });
  assert.strictEqual(draw.winner, 'draw');
  const sched = fd.normalize({ status: 'TIMED', homeTeam: {}, awayTeam: {}, score: { fullTime: {} } });
  assert.strictEqual(sched.winner, null);
  assert.strictEqual(sched.status, 'scheduled');
});
