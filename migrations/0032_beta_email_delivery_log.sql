CREATE TABLE IF NOT EXISTS beta_email_delivery_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  template_key TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_beta_email_delivery_email ON beta_email_delivery_log(email, created_at DESC);
