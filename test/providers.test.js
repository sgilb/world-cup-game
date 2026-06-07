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

test('football-data: draw and scheduled have no/null winner', () => {
  const draw = fd.normalize({ status: 'FINISHED', homeTeam: {}, awayTeam: {}, score: { winner: 'DRAW', fullTime: { home: 0, away: 0 } } });
  assert.strictEqual(draw.winner, 'draw');
  const sched = fd.normalize({ status: 'TIMED', homeTeam: {}, awayTeam: {}, score: { fullTime: {} } });
  assert.strictEqual(sched.winner, null);
  assert.strictEqual(sched.status, 'scheduled');
});
