CREATE INDEX IF NOT EXISTS household_invites_token_status_idx ON household_invites(token_hash,status,expires_at);
CREATE INDEX IF NOT EXISTS household_invites_email_status_idx ON household_invites(email,status,expires_at);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','cancelled','blocked','completed')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  earliest_delete_at TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  reason_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx ON account_deletion_requests(status,earliest_delete_at);
