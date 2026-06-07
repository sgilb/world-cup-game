# Live data: provider choice & rate limits

The app pulls **final match results** from a football data API by polling, with
**manual score entry** as an always-works fallback. This doc explains the
provider options and why the default is what it is.

## We only need final results

The league table changes when a match *finishes*, not on every goal. So the app
polls a provider periodically, reads finished matches, and updates points. We do
**not** need a live in-play feed, which simplifies the provider choice and keeps
us comfortably inside free rate limits.

## Provider options

Set `RESULTS_PROVIDER` in `.env`.

### `football-data` — default, recommended for free use

[football-data.org](https://www.football-data.org/). One call to
`/competitions/WC/matches` returns every match with the winner resolved
(including extra-time / penalty winners via `score.winner`).

- **10 requests/minute, no daily cap** — very low rate-limit risk.
- World Cup is included on the **free** tier (competition code `WC`).
- Scores are *delayed* on free — **irrelevant** since we only use final results.
- Free key: https://www.football-data.org/client/register

### `api-football` — only if you ever want live in-play scores

[api-sports.io](https://www.api-football.com/). Live endpoint refreshed every
~15s.

- **100 requests/day** hard cap — tighter; needs windowed polling to stay under.
- Free tier sometimes **restricts seasons** — verify WC 2026 is available on
  your key before relying on it (`WC_LEAGUE_ID` / `WC_SEASON`).

## How polling stays cheap

The poller (`lib/poller.js`) only calls the API when a fixture is inside a
**live window** (kickoff −5 min to +3.5 h, wide enough to catch extra-time /
penalty finishes). Outside those windows it idles. With football-data's
per-minute limit and no daily cap, this is trivially within budget; with
api-football it keeps you under the 100/day cap.

Enable it:

```env
POLL_ENABLED=true
RESULTS_PROVIDER=football-data
FOOTBALL_DATA_KEY=your-key
```

The admin dashboard's **"Poll API now"** button forces an immediate fetch
regardless of windows. Manual entries are never overwritten by the poller.

## Real fixture schedule sync

With `football-data` configured, confirming a game also calls `fetchFixtures()`
and overlays the **real kickoff times, matchdays, and stages** onto the
generated fixtures. Matching is by canonical team-pair (same alias-aware logic as
results), so fixtures keep our **seed team names** — preserving the
team→participant and tier links. Scores are never touched here (the poller owns
those).

- **Group stage** (72 fixtures): real kickoff/matchday overlaid onto the
  generated fixtures; home/away aligned to the real schedule (only while a
  fixture is unscored, so a stored winner is never inverted).
- **Knockout bracket** (32 fixtures): **auto-populates**. Knockout matches start
  with undecided teams; once the provider reports both teams (it resolves the
  8-best-third-placed logic and bracket pairing), the fixture is **inserted**,
  keyed by the provider's stable match id so re-syncs update rather than
  duplicate. The poller then scores it by team-pair and it counts in the league
  table like any other match.

Re-run the **"Sync fixture times"** button periodically through the knockouts to
pull in each round as it's decided. Validate name coverage any time with
`node scripts/check-schedule-sync.js`; test knockout handling offline with
`node scripts/check-knockout.js`.

## Why not webhooks?

Webhooks (provider pushes a goal event the moment it happens) are great for
*live* updates, but for final-results-only on a free plan they're the wrong
tool: free webhook allowances are tiny (e.g. BALLDONTLIE's free tier is ~100
deliveries/*month*, exhausted in a single match day), and World Cup events are
typically paid-only. Polling fits the free budget far better here.
