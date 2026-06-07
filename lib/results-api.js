'use strict';

/**
 * Results provider dispatcher. Selects the live-results source from
 * RESULTS_PROVIDER (default 'football-data') and exposes a single
 * fetchResults() -> normalized result array, used by the poller.
 *
 * Normalized result: { homeTeam, awayTeam, homeGoals, awayGoals, status, winner, liveClock }
 *
 *  - 'football-data' (default): football-data.org. 10 req/min, no daily cap,
 *    WC included on free, delayed scores (fine for final results). LOW rate-limit risk.
 *  - 'api-football': api-sports.io. Live in-play feed (15s) but 100 req/day cap
 *    and free-tier season restrictions. Use if you need true live scores.
 */

const footballData = require('./providers/football-data');
const apiFootball = require('./providers/api-football');

function providerName() {
  return (process.env.RESULTS_PROVIDER || 'football-data').toLowerCase();
}

function apiKeyFor(provider) {
  return provider === 'api-football'
    ? (process.env.API_FOOTBALL_KEY || '')
    : (process.env.FOOTBALL_DATA_KEY || '');
}

/** Does the selected provider have a key configured? */
function hasKey() {
  return Boolean(apiKeyFor(providerName()));
}

/** Fetch the latest results from the configured provider (one API request). */
async function fetchResults() {
  const provider = providerName();
  if (provider === 'api-football') {
    return apiFootball.fetchLive({
      apiKey: process.env.API_FOOTBALL_KEY,
      leagueId: process.env.WC_LEAGUE_ID,
    });
  }
  return footballData.fetchMatches({
    apiKey: process.env.FOOTBALL_DATA_KEY,
    competition: process.env.FOOTBALL_DATA_COMPETITION || 'WC',
  });
}

/**
 * Fetch the real fixture schedule (kickoff times, stage, group, matchday) from
 * the provider. Only football-data exposes this; other providers return [] and
 * the app keeps its generated schedule.
 */
async function fetchFixtures() {
  if (providerName() === 'football-data') {
    return footballData.fetchFixtures({
      apiKey: process.env.FOOTBALL_DATA_KEY,
      competition: process.env.FOOTBALL_DATA_COMPETITION || 'WC',
    });
  }
  return [];
}

module.exports = { providerName, hasKey, fetchResults, fetchFixtures, footballData, apiFootball };
