-- Apply when enabling public challenges. Standard wins rank by earliest winning week.
CREATE TABLE verified_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  win_week INTEGER NOT NULL CHECK (win_week >= 1),
  replay_hash TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX verified_runs_board
  ON verified_runs (challenge_id, rules_version, win_week, run_id);
