CREATE TABLE IF NOT EXISTS product_usage_daily (
  household_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, usage_date, event_key),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_usage_daily_date
  ON product_usage_daily(usage_date, event_key);

CREATE TABLE IF NOT EXISTS beta_tester_allowlist (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused')),
  notes TEXT,
  invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS launch_roadmap_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'building', 'testing', 'ready')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS launch_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO launch_settings (key, value) VALUES
  ('private_beta_enabled', 'false'),
  ('public_landing_ready', 'false'),
  ('legal_privacy_ready', 'false'),
  ('email_communication_ready', 'false');

INSERT OR IGNORE INTO launch_roadmap_items (id, title, description, status, sort_order) VALUES
  ('family-coordination', 'Family Coordination', 'Finish the actionable household planning and workload experience.', 'testing', 10),
  ('private-beta', 'Private beta infrastructure', 'Control who can enter Kit Hub while early household testing is underway.', 'ready', 20),
  ('privacy-analytics', 'Privacy-safe analytics', 'Measure adoption and return behaviour without storing family content, searches, messages or location.', 'ready', 30),
  ('feedback-loop', 'Tester feedback loop', 'Connect tester feedback to product decisions and release follow-up.', 'ready', 40),
  ('email-communication', 'Email communication', 'Prepare opt-in onboarding, beta updates and release communication before connecting a delivery provider.', 'planned', 50),
  ('public-product-page', 'Public product page', 'Prepare positioning, screenshots, privacy explanation and feature tour.', 'planned', 60),
  ('beta-launch', 'Invite the first outside households', 'Start a controlled beta and watch whether households return voluntarily.', 'planned', 70);
