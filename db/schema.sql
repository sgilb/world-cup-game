-- World Cup Sweepstakes schema. Safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'setup',      -- 'setup' | 'active'
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  token     TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS teams (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  group_code      TEXT NOT NULL,
  fifa_rank       INTEGER NOT NULL,
  tier            TEXT NOT NULL,                       -- 'A' | 'B' | 'C'
  multiplier      INTEGER NOT NULL,                    -- 1 | 2 | 3
  participant_id  INTEGER REFERENCES participants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fixtures (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,                          -- 'group' | 'R32' | ...
  group_code   TEXT,                                   -- NULL for knockout
  matchday     INTEGER,
  home_team    TEXT NOT NULL,
  away_team    TEXT NOT NULL,
  kickoff_utc  TEXT NOT NULL,
  home_goals   INTEGER,
  away_goals   INTEGER,
  status       TEXT NOT NULL DEFAULT 'scheduled',      -- 'scheduled' | 'live' | 'finished'
  live_clock   TEXT,                                   -- e.g. '1H', 'HT', '2H', 'ET', '67'
  winner       TEXT,                                   -- 'home' | 'away' | 'draw' | NULL
  source       TEXT NOT NULL DEFAULT 'api',            -- 'api' | 'manual'
  ext_id       TEXT                                    -- provider match id (stable key for knockout upserts)
);

CREATE INDEX IF NOT EXISTS idx_teams_game ON teams(game_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_game ON fixtures(game_id);
CREATE INDEX IF NOT EXISTS idx_participants_token ON participants(token);
