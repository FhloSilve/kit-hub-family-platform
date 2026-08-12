-- Security hardening for household invitations and account deletion.
--
-- Production can contain several historical household_invites layouts. Some of
-- those predate both email and hashed-token columns, so attempting to copy rows
-- by column name is not portable. Old pending invitation tokens cannot be
-- upgraded securely anyway because their raw token material is unavailable.
-- Recreate only the invitation table; household/member data is untouched.
-- Existing invitations must simply be re-issued after this migration.

DROP TABLE IF EXISTS household_invites;

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
