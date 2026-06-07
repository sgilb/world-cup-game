'use strict';

const resultsApi = require('./results-api');
const { applyResultsToDb } = require('./matching');
const game = require('./game');

const WINDOW_PRE_MS = 5 * 60 * 1000;          // start polling 5 min before kickoff
const WINDOW_POST_MS = 3.5 * 60 * 60 * 1000;  // ...until 3.5h after kickoff (covers ET + pens + delay)

function config() {
  return {
    enabled: String(process.env.POLL_ENABLED || 'false').toLowerCase() === 'true',
    intervalMin: Number(process.env.POLL_INTERVAL_MIN || 5),
    scheduleSyncHours: Number(process.env.SCHEDULE_SYNC_HOURS || 6),
  };
}

/** Is `now` within any fixture's live window? Avoids needless off-hours calls. */
function inLiveWindow(fixtures, now = new Date()) {
  const t = now.getTime();
  return fixtures.some((fx) => {
    if (fx.status === 'finished') return false;
    const ko = new Date(fx.kickoff_utc).getTime();
    if (Number.isNaN(ko)) return false;
    return t >= ko - WINDOW_PRE_MS && t <= ko + WINDOW_POST_MS;
  });
}

/**
 * Poll once. Fetches results from the configured provider (one API request) and
 * applies them to every active game. Skips the API call when no fixture is in a
 * live window (unless force=true, used by the admin "poll now" button).
 * @returns {Promise<{polled:boolean, reason?:string, updated?:number}>}
 */
async function pollOnce(db, { force = false } = {}) {
  if (!resultsApi.hasKey()) {
    return { polled: false, reason: `no API key for provider '${resultsApi.providerName()}'` };
  }

  const allFixtures = db
    .prepare(`SELECT f.* FROM fixtures f JOIN games g ON g.id = f.game_id WHERE g.status = 'active'`)
    .all();

  if (!force && !inLiveWindow(allFixtures)) {
    return { polled: false, reason: 'outside live window' };
  }

  const results = await resultsApi.fetchResults();

  const activeGameIds = db
    .prepare(`SELECT id FROM games WHERE status = 'active'`)
    .all()
    .map((r) => r.id);

  let updated = 0;
  for (const gameId of activeGameIds) {
    updated += applyResultsToDb(db, gameId, results).updated;
  }
  return { polled: true, updated, matchCount: results.length };
}

/**
 * Sync the real fixture schedule into every active game (one API request total).
 * Runs independently of the score-poll's live-window gate so the knockout
 * bracket auto-populates as rounds are decided. No-ops for providers without a
 * schedule feed (e.g. api-football returns no fixtures here).
 * @returns {Promise<{games:number, added:number, updated:number}|null>}
 */
async function syncSchedules(db) {
  if (!resultsApi.hasKey()) return null;
  const fixtures = await resultsApi.fetchFixtures();
  if (!fixtures.length) return { games: 0, added: 0, updated: 0 };

  const ids = db.prepare(`SELECT id FROM games WHERE status = 'active'`).all().map((r) => r.id);
  let added = 0, updated = 0;
  for (const id of ids) {
    const r = await game.syncSchedule(id, { fixtures });
    added += r.knockoutAdded;
    updated += r.groupSynced + r.knockoutUpdated;
  }
  return { games: ids.length, added, updated };
}

/** Start the background interval poller. Returns a stop() function. */
function startPoller(db) {
  const cfg = config();
  if (!cfg.enabled || !resultsApi.hasKey()) {
    console.log(`[poller] disabled (set POLL_ENABLED=true and a key for provider '${resultsApi.providerName()}')`);
    return () => {};
  }
  const ms = Math.max(1, cfg.intervalMin) * 60 * 1000;
  const scheduleMs = Math.max(1, cfg.scheduleSyncHours) * 60 * 60 * 1000;
  console.log(`[poller] enabled: provider='${resultsApi.providerName()}', scores every ${cfg.intervalMin} min (in live windows), schedule every ${cfg.scheduleSyncHours}h`);

  // Sync the schedule once on boot (picks up bracket changes after a restart).
  let lastScheduleSync = Date.now();
  syncSchedules(db)
    .then((s) => { if (s && (s.added || s.updated)) console.log(`[poller] boot schedule sync: +${s.added} knockout, ${s.updated} updated`); })
    .catch((err) => console.error('[poller] boot schedule sync error:', err.message));

  const handle = setInterval(async () => {
    try {
      const res = await pollOnce(db);
      if (res.polled) console.log(`[poller] updated ${res.updated} fixtures (${res.matchCount} matches)`);
    } catch (err) {
      console.error('[poller] score poll error:', err.message);
    }

    if (Date.now() - lastScheduleSync >= scheduleMs) {
      lastScheduleSync = Date.now();
      try {
        const s = await syncSchedules(db);
        if (s && (s.added || s.updated)) console.log(`[poller] schedule sync: +${s.added} knockout, ${s.updated} updated`);
      } catch (err) {
        console.error('[poller] schedule sync error:', err.message);
      }
    }
  }, ms);
  handle.unref?.();
  return () => clearInterval(handle);
}

module.exports = { inLiveWindow, pollOnce, syncSchedules, startPoller };
