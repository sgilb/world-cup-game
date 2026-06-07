'use strict';

/* Validates that football-data.org team names map to our 48 seed names, using
   the real API (reads FOOTBALL_DATA_KEY from .env). Reports any unmatched names
   so aliases can be added. Run: node scripts/check-schedule-sync.js */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { canonicalKey } = require('../lib/matching');
const resultsApi = require('../lib/results-api');

(async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'teams-2026.json'), 'utf8'));
  const seedByCanon = new Map(seed.teams.map((t) => [canonicalKey(t.name), t.name]));

  const apiFixtures = await resultsApi.fetchFixtures();
  console.log(`provider=${resultsApi.providerName()} fixtures=${apiFixtures.length}`);
  if (!apiFixtures.length) {
    console.log('No fixtures returned (no key, empty competition, or non-football-data provider).');
    return;
  }

  const apiTeams = new Set();
  for (const f of apiFixtures) {
    if (f.homeTeam) apiTeams.add(f.homeTeam);
    if (f.awayTeam) apiTeams.add(f.awayTeam);
  }

  const unmatched = [];
  for (const name of apiTeams) {
    if (!seedByCanon.has(canonicalKey(name))) unmatched.push(name);
  }

  console.log(`distinct API teams: ${apiTeams.size}`);
  console.log(`mapped to a seed team: ${apiTeams.size - unmatched.length}/${apiTeams.size}`);
  if (unmatched.length) {
    console.log('\nUNMATCHED API names (need an alias in lib/matching.js ALIASES):');
    for (const n of unmatched.sort()) console.log('  - ' + JSON.stringify(n));
  } else {
    console.log('\nAll API team names map cleanly to seed names. ✅');
  }

  // Also report group-stage fixture coverage.
  const groupStage = apiFixtures.filter((f) => f.stage === 'GROUP_STAGE' && f.homeTeam && f.awayTeam);
  const mappedGroup = groupStage.filter((f) => seedByCanon.has(canonicalKey(f.homeTeam)) && seedByCanon.has(canonicalKey(f.awayTeam)));
  console.log(`\ngroup-stage fixtures: ${groupStage.length}, fully mappable: ${mappedGroup.length}`);
  const sample = apiFixtures.find((f) => f.homeTeam && f.awayTeam);
  if (sample) console.log('sample:', sample.kickoff, '|', sample.stage, sample.group, 'MD' + sample.matchday, '|', sample.homeTeam, 'v', sample.awayTeam);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
