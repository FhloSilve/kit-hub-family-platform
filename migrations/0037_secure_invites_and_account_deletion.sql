-- Security hardening for household invitations and account deletion.
--
-- Production may contain an older household_invites table that predates the
-- hashed-token schema. CREATE TABLE IF NOT EXISTS in the baseline migrations
-- cannot add missing columns to that legacy table, so rebuild it here before
-- creating the new indexes. Existing pending invites are expired because their
-- original raw token cannot be safely reconstructed; accepted/revoked/expired
-- history is preserved.

ALTER TABLE household_invites RENAME TO household_invites_legacy_0037;

CREATE TABLE household_invites (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'adult',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (role_key) REFERENCES roles(key) ON DELETE RESTRICT,
  FOREIGN KEY (invited_by) REFERENCES "user"(id) ON DELETE RESTRICT
);

INSERT INTO household_invites (
  id, household_id, email, role_key, token_hash, status,
  invited_by, expires_at, created_at, updated_at
)
SELECT
  id,
  household_id,
  email,
  role_key,
  lower(hex(randomblob(32))),
  CASE WHEN status='pending' THEN 'expired' ELSE status END,
  invited_by,
  expires_at,
  created_at,
  datetime('now')
FROM household_invites_legacy_0037;

DROP TABLE household_invites_legacy_0037;

CREATE INDEX IF NOT EXISTS household_invites_household_idx ON household_invites(household_id,status);
CREATE INDEX IF NOT EXISTS household_invites_email_idx ON household_invites(email,status);
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
