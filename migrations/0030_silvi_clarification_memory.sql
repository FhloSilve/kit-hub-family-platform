CREATE TABLE IF NOT EXISTS silvi_clarification_state (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_silvi_clarification_expiry ON silvi_clarification_state(expires_at);
