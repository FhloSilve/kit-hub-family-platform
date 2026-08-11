CREATE TABLE IF NOT EXISTS beta_email_preferences (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  welcome_opt_in INTEGER NOT NULL DEFAULT 1,
  beta_updates_opt_in INTEGER NOT NULL DEFAULT 1,
  release_notes_opt_in INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS app_reliability_daily (
  metric_date TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (metric_date, metric_key)
);
