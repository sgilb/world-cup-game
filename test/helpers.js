'use strict';

const fs = require('fs');
const path = require('path');
const { assignTiers } = require('../lib/tiers');

/** Deterministic seedable RNG (mulberry32) returning floats in [0,1). */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 48 real teams with computed tiers, as distribute() expects. */
function seededTeams() {
  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'teams-2026.json'), 'utf8')
  );
  return assignTiers(seed.teams).map((t) => ({ name: t.name, group: t.group, tier: t.tier }));
}

function participants(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
}

module.exports = { makeRng, seededTeams, participants };
