-- Repair the household-side baseline for databases where the Better Auth
-- tables existed before Wrangler recorded the original application migration.
-- Every statement is additive and safe when the full schema already exists.

CREATE TABLE IF NOT EXISTS "profiles" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "display_name" TEXT NOT NULL,
  "preferred_language" TEXT NOT NULL DEFAULT 'en',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "avatar_url" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "households" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "roles" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rank" INTEGER NOT NULL
);

INSERT OR IGNORE INTO "roles" ("key", "display_name", "description", "rank") VALUES
  ('owner', 'House Owner', 'Owns the household lifecycle and billing.', 100),
  ('admin', 'Admin', 'Manages household settings without owning private member data.', 80),
  ('adult', 'Adult', 'Participates broadly in everyday household life.', 60),
  ('teen', 'Teen', 'Participates with age-aware controls.', 40),
  ('child', 'Child', 'Uses a simplified, tightly controlled experience.', 20),
  ('guest', 'Guest', 'Has temporary or narrowly scoped access.', 10);

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('invited', 'active', 'suspended', 'left')),
  "joined_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT,
  UNIQUE ("household_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "memberships_user_idx" ON "memberships" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "memberships_household_idx" ON "memberships" ("household_id", "status");

CREATE TABLE IF NOT EXISTS "permissions" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "description" TEXT NOT NULL
);

INSERT OR IGNORE INTO "permissions" ("key", "description") VALUES
  ('household.view', 'View the household and its shared resources.'),
  ('household.manage', 'Manage household settings and membership.'),
  ('household.delete', 'Archive or delete the household.'),
  ('members.invite', 'Invite a person into the household.'),
  ('members.manage', 'Change roles or membership status.'),
  ('calendar.manage', 'Create and manage shared calendar entries.'),
  ('tasks.manage', 'Create and manage shared household tasks.'),
  ('groceries.manage', 'Create and manage shared grocery lists.'),
  ('notes.manage', 'Create and manage shared household notes.'),
  ('audit.view', 'View security and administrative audit records.');

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_key" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL DEFAULT 'allow' CHECK ("effect" IN ('allow', 'deny')),
  PRIMARY KEY ("role_key", "permission_key"),
  FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE CASCADE,
  FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE
);

INSERT OR IGNORE INTO "role_permissions" ("role_key", "permission_key") VALUES
  ('owner', 'household.view'), ('owner', 'household.manage'), ('owner', 'household.delete'),
  ('owner', 'members.invite'), ('owner', 'members.manage'), ('owner', 'calendar.manage'),
  ('owner', 'tasks.manage'), ('owner', 'groceries.manage'), ('owner', 'notes.manage'), ('owner', 'audit.view'),
  ('admin', 'household.view'), ('admin', 'household.manage'), ('admin', 'members.invite'),
  ('admin', 'members.manage'), ('admin', 'calendar.manage'), ('admin', 'tasks.manage'),
  ('admin', 'groceries.manage'), ('admin', 'notes.manage'), ('admin', 'audit.view'),
  ('adult', 'household.view'), ('adult', 'calendar.manage'), ('adult', 'tasks.manage'),
  ('adult', 'groceries.manage'), ('adult', 'notes.manage'),
  ('teen', 'household.view'), ('teen', 'calendar.manage'), ('teen', 'tasks.manage'),
  ('teen', 'groceries.manage'), ('teen', 'notes.manage'),
  ('child', 'household.view'), ('child', 'tasks.manage'), ('child', 'groceries.manage'),
  ('guest', 'household.view');

CREATE TABLE IF NOT EXISTS "member_permission_overrides" (
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL CHECK ("effect" IN ('allow', 'deny')),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("household_id", "user_id", "permission_key"),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "household_invites" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
  "expires_at" TEXT NOT NULL,
  "invited_by" TEXT NOT NULL,
  "accepted_by" TEXT,
  "accepted_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT,
  FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "household_invites_household_idx" ON "household_invites" ("household_id", "status");
CREATE INDEX IF NOT EXISTS "household_invites_email_idx" ON "household_invites" ("email", "status");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "result" TEXT NOT NULL CHECK ("result" IN ('success', 'denied', 'failed')),
  "metadata_json" TEXT,
  "request_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL,
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "audit_events_household_created_idx" ON "audit_events" ("household_id", "created_at");
