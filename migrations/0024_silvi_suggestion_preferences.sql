CREATE TABLE IF NOT EXISTS silvi_suggestion_preferences (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('dismissed','snoozed')),
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, user_id, insight_id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_silvi_suggestion_preferences_user
  ON silvi_suggestion_preferences(household_id, user_id, state, snoozed_until);
