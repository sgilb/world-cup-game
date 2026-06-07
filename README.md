# World Cup 2026 Sweepstakes ⚽

A web app for running a 2026 FIFA World Cup sweepstakes among friends. An admin
creates a game, names the participants, and the app distributes all 48 teams so
that — as much as possible — no one holds two teams from the same group. Each
participant gets a private link showing their teams, fixtures (with the rival
participant named when their teams meet), and a live league table.

## Scoring

| Result | Base points |
|--------|-------------|
| Win (incl. extra-time / penalties) | 3 |
| Draw | 1 |
| Loss | 0 |

Base points are multiplied by the team's **tier**, derived by splitting all 48
teams into even thirds by FIFA ranking:

| Tier | FIFA-rank third | Multiplier |
|------|-----------------|------------|
| A | top 16 | ×1 |
| B | middle 16 | ×2 |
| C | bottom 16 | ×3 |

Back an underdog (tier C), win, and you score big.

## Quick start

```bash
npm install
cp .env.example .env       # then edit ADMIN_PASSWORD (and a key, optionally)
npm start                  # http://localhost:3000
```

1. Go to `/admin`, log in with `ADMIN_PASSWORD`.
2. Create a game, add participants, click **Confirm & distribute**.
3. Copy each participant's private link from the dashboard and send it out.
4. Enter scores manually, or enable the API poller (below).

## Live results

The app tracks **final match results**. Two ways to get scores in, used together:

- **Manual entry** — always available on the admin dashboard. No API key needed.
  Manual entries are authoritative and are never overwritten by the API.
- **Polling a football API** — set `POLL_ENABLED=true` and a provider key. The
  default provider is **football-data.org** (`RESULTS_PROVIDER=football-data`):
  free, World Cup included, 10 req/min with no daily cap — the lowest
  rate-limit-risk free option for final results. The poller only calls the API
  inside a fixture's **live window** (kickoff −5 min to +3.5 h); cadence is
  `POLL_INTERVAL_MIN` (default 5). The admin **"Poll API now"** button forces an
  immediate fetch.

**Real kickoff times:** when football-data.org is configured, confirming a game
also pulls the **real fixture schedule** (kickoff times, matchdays) and overlays
it onto the generated fixtures — matched by team pairing so participant
assignments and tiers are preserved. Re-run any time with the admin **"Sync
fixture times"** button (useful as knockout fixtures firm up). Without a key, the
app falls back to approximate group-stage dates.

See [docs/live-data.md](docs/live-data.md) for provider options (including
`api-football` for live in-play scores) and rate-limit details.

## Tests

```bash
npm test            # unit tests: tiering, distribution, scoring
node scripts/e2e.js # end-to-end: create game -> distribute -> score -> view
```

## Tech

Node/Express, SQLite (`better-sqlite3`), EJS server-rendered views, vanilla-JS
client polling for live refresh. Seed data: `data/teams-2026.json` (48 teams +
groups + FIFA ranks; tiers computed at game creation). Group-stage fixtures are
generated as round-robin in `lib/fixtures.js`.
