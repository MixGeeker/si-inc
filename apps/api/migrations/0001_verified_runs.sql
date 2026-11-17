-- Initial schema for future public challenges. Winning time uses completed game days.
CREATE TABLE verified_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  win_day INTEGER NOT NULL CHECK (win_day >= 0),
  replay_hash TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX verified_runs_board
  ON verified_runs (challenge_id, rules_version, win_day, run_id);
