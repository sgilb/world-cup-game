'use strict';

/**
 * API-Football (api-sports.io) adapter. Alternative provider — best for live
 * in-play scores (free endpoint refreshed every ~15s) but a tight 100 req/day
 * cap and free-tier season restrictions. See lib/providers/football-data.js for
 * the default (better for final-results-only on free).
 *
 * One all-live call covers every in-progress match; we filter to the WC league.
 * No key => returns [] so the app runs on manual entry.
 */

const BASE = 'https://v3.football.api-sports.io';

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

function mapStatus(short) {
  if (FINISHED_STATUSES.has(short)) return 'finished';
  if (LIVE_STATUSES.has(short)) return 'live';
  return 'scheduled';
}

/** Map one API-Football fixture object to our normalized shape. */
function normalize(item) {
  const short = item.fixture?.status?.short;
  const status = mapStatus(short);
  const elapsed = item.fixture?.status?.elapsed;
  let winner = null;
  if (status === 'finished') {
    if (item.teams?.home?.winner === true) winner = 'home';
    else if (item.teams?.away?.winner === true) winner = 'away';
    else winner = 'draw';
  }
  return {
    homeTeam: item.teams?.home?.name,
    awayTeam: item.teams?.away?.name,
    homeGoals: item.goals?.home ?? null,
    awayGoals: item.goals?.away ?? null,
    status,
    winner,
    liveClock: status === 'live' ? (elapsed != null ? `${elapsed}'` : short) : null,
    kickoff: item.fixture?.date || null,
    leagueId: item.league?.id ?? null,
  };
}

async function request(path, { apiKey }) {
  if (!apiKey) return [];
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': apiKey } });
  if (!res.ok) throw new Error(`API-Football ${path} -> HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football errors: ${JSON.stringify(json.errors)}`);
  }
  return Array.isArray(json.response) ? json.response : [];
}

/** All currently-live fixtures for the configured league. One API request. */
async function fetchLive({ apiKey, leagueId }) {
  const items = await request('/fixtures?live=all', { apiKey });
  return items
    .map(normalize)
    .filter((f) => leagueId == null || f.leagueId === Number(leagueId));
}

/** Fixtures for a given date (back-fill finished results). One request. */
async function fetchByDate({ apiKey, leagueId, season, date }) {
  const items = await request(`/fixtures?league=${leagueId}&season=${season}&date=${date}`, { apiKey });
  return items.map(normalize);
}

module.exports = { normalize, mapStatus, fetchLive, fetchByDate };
