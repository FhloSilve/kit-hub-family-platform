CREATE TABLE IF NOT EXISTS household_presence (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status_text TEXT,
  status_expires_at TEXT,
  status_visible_to TEXT NOT NULL DEFAULT '[]',
  latitude REAL,
  longitude REAL,
  location_accuracy TEXT CHECK (location_accuracy IN ('approximate','precise')),
  location_expires_at TEXT,
  location_visible_to TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, user_id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_household_presence_household ON household_presence(household_id);
CREATE INDEX IF NOT EXISTS idx_household_presence_status_expiry ON household_presence(status_expires_at);
CREATE INDEX IF NOT EXISTS idx_household_presence_location_expiry ON household_presence(location_expires_at);
