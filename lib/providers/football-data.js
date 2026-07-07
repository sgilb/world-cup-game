'use strict';

/**
 * football-data.org adapter (DEFAULT provider).
 *
 * Free tier: 10 requests/MINUTE, no daily cap, World Cup included (competition
 * code "WC"). Scores are delayed on the free tier — irrelevant when we only
 * need FINAL results. One call to /competitions/WC/matches returns every match
 * (scheduled/in-play/finished) with the winner already resolved (incl. ET/pens
 * via score.winner), so it's the lowest-rate-limit-risk free option.
 *
 * Docs: https://docs.football-data.org/general/v4/index.html
 * No key => returns [] so the app runs on manual entry.
 */

const BASE = 'https://api.football-data.org/v4';

const FINISHED = new Set(['FINISHED', 'AWARDED']);
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'SUSPENDED']);

function mapStatus(s) {
  if (FINISHED.has(s)) return 'finished';
  if (LIVE.has(s)) return 'live';
  return 'scheduled'; // SCHEDULED, TIMED, POSTPONED, CANCELLED, ...
}

/** Map one football-data.org match object to our normalized shape. */
function normalize(m) {
  const status = mapStatus(m.status);
  const score = m.score || {};
  const ft = score.fullTime || {};
  // On a penalty shoot-out, score.fullTime bakes the shoot-out tally into the
  // score (e.g. a 1-1 (a.e.t.) 4-2 win reads fullTime 5-3). We want the score as
  // it stood at the end of extra time — a level score — and let score.winner
  // decide the match, so strip the shoot-out goals (score.penalties) back off.
  const pens = score.duration === 'PENALTY_SHOOTOUT' ? (score.penalties || {}) : {};
  let winner = null;
  if (status === 'finished') {
    if (score.winner === 'HOME_TEAM') winner = 'home';
    else if (score.winner === 'AWAY_TEAM') winner = 'away';
    else winner = 'draw'; // score.winner === 'DRAW'
  }
  return {
    homeTeam: m.homeTeam?.name,
    awayTeam: m.awayTeam?.name,
    homeGoals: ft.home != null ? ft.home - (pens.home ?? 0) : null,
    awayGoals: ft.away != null ? ft.away - (pens.away ?? 0) : null,
    status,
    winner,
    liveClock: status === 'live' ? (m.minute != null ? `${m.minute}'` : 'LIVE') : null,
    kickoff: m.utcDate || null,
  };
}

/** Schedule metadata for one match (kickoff/stage/group/matchday + team names). */
function normalizeFixture(m) {
  return {
    extId: m.id ?? null,
    stage: m.stage || null,          // GROUP_STAGE, LAST_16, ...
    group: m.group || null,          // GROUP_A ... GROUP_L, or null for knockout
    matchday: m.matchday ?? null,
    homeTeam: m.homeTeam?.name || null, // null for not-yet-determined knockout slots
    awayTeam: m.awayTeam?.name || null,
    kickoff: m.utcDate || null,
  };
}

async function getMatches({ apiKey, competition }) {
  const res = await fetch(`${BASE}/competitions/${competition}/matches`, {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) {
    throw new Error(`football-data /competitions/${competition}/matches -> HTTP ${res.status}`);
  }
  const json = await res.json();
  return Array.isArray(json.matches) ? json.matches : [];
}

/** All match results for the competition (one request). competition defaults to 'WC'. */
async function fetchMatches({ apiKey, competition = 'WC' }) {
  if (!apiKey) return [];
  return (await getMatches({ apiKey, competition })).map(normalize);
}

/** All fixture schedule entries for the competition (one request). */
async function fetchFixtures({ apiKey, competition = 'WC' }) {
  if (!apiKey) return [];
  return (await getMatches({ apiKey, competition })).map(normalizeFixture);
}

module.exports = { normalize, normalizeFixture, mapStatus, fetchMatches, fetchFixtures };
