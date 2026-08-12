CREATE TABLE IF NOT EXISTS beta_tester_journey (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  welcome_seen_at TEXT,
  silvi_tried_at TEXT,
  feedback_prompt_dismissed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES beta_tester_allowlist(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_beta_tester_journey_updated
  ON beta_tester_journey(updated_at DESC);
