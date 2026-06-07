'use strict';

/**
 * Match normalized API results (from results-api.js) to our stored fixtures and
 * apply score updates. Matching is orientation-agnostic: our generated
 * group-stage fixtures may list home/away in a different order than the real
 * schedule, so we match on the unordered team pair and then map goals/winner
 * onto our fixture's actual orientation.
 *
 * Manual entries (source='manual') are never overwritten by API data.
 */

// API-Football name variants -> our seed (canonical) names. Extend as needed.
const ALIASES = {
  'turkey': 'türkiye',
  'ivory coast': "côte d'ivoire",
  'czech republic': 'czechia',
  'usa': 'united states',
  'korea republic': 'south korea',
  'south korea': 'south korea',
  'congo dr': 'dr congo',
  'congo-kinshasa': 'dr congo',
  'dr congo': 'dr congo',
  'cabo verde': 'cape verde',
  'cape verde islands': 'cape verde',
  'iran': 'iran',
  'ir iran': 'iran',
  'bosnia & herzegovina': 'bosnia and herzegovina',
  'bosnia-herzegovina': 'bosnia and herzegovina',
};

/** Normalize a name: lowercase, strip diacritics & non-alphanumerics. */
function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Canonical key for a team name (applies aliases, then normalizes). */
function canonicalKey(name) {
  const lower = String(name || '').trim().toLowerCase();
  const aliased = ALIASES[lower] || name;
  return normalizeName(aliased);
}

/** Unordered pair key for two team names. */
function pairKey(a, b) {
  return [canonicalKey(a), canonicalKey(b)].sort().join('|');
}

/**
 * Apply normalized results to the game's fixtures.
 * @returns {{updated:number, skippedManual:number, unmatched:Array}}
 */
function applyResultsToDb(db, gameId, results) {
  const fixtures = db
    .prepare('SELECT * FROM fixtures WHERE game_id = ?')
    .all(gameId);
  const byPair = new Map();
  for (const fx of fixtures) byPair.set(pairKey(fx.home_team, fx.away_team), fx);

  const update = db.prepare(`
    UPDATE fixtures
       SET home_goals = ?, away_goals = ?, status = ?, winner = ?, live_clock = ?, source = 'api'
     WHERE id = ?
  `);

  let updated = 0;
  let skippedManual = 0;
  const unmatched = [];

  const tx = db.transaction((items) => {
    for (const r of items) {
      if (!r.homeTeam || !r.awayTeam) continue;
      const fx = byPair.get(pairKey(r.homeTeam, r.awayTeam));
      if (!fx) { unmatched.push(`${r.homeTeam} v ${r.awayTeam}`); continue; }
      if (fx.source === 'manual') { skippedManual++; continue; }

      // Map goals onto our fixture's orientation.
      const sameOrientation = canonicalKey(r.homeTeam) === canonicalKey(fx.home_team);
      const homeGoals = sameOrientation ? r.homeGoals : r.awayGoals;
      const awayGoals = sameOrientation ? r.awayGoals : r.homeGoals;

      // Map winner onto our orientation.
      let winner = null;
      if (r.winner === 'draw') winner = 'draw';
      else if (r.winner === 'home' || r.winner === 'away') {
        const winnerTeam = r.winner === 'home' ? r.homeTeam : r.awayTeam;
        winner = canonicalKey(winnerTeam) === canonicalKey(fx.home_team) ? 'home' : 'away';
      }

      update.run(homeGoals, awayGoals, r.status, winner, r.liveClock ?? null, fx.id);
      updated++;
    }
  });
  tx(results);

  return { updated, skippedManual, unmatched };
}

module.exports = { normalizeName, canonicalKey, pairKey, applyResultsToDb };
