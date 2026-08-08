-- Better Auth core tables (camelCase matches Better Auth's default field mapping).
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" ("providerId", "accountId");

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Kit Hub global profile and household tenancy.
CREATE TABLE "profiles" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "display_name" TEXT NOT NULL,
  "preferred_language" TEXT NOT NULL DEFAULT 'en',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "theme" TEXT NOT NULL DEFAULT 'meadow',
  "startup_mode" TEXT NOT NULL DEFAULT 'quick' CHECK ("startup_mode" IN ('quick', 'immersive', 'direct')),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "households" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "default_language" TEXT NOT NULL DEFAULT 'en',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "theme" TEXT NOT NULL DEFAULT 'meadow',
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "deleted_at" TEXT,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE TABLE "roles" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rank" INTEGER NOT NULL
);

INSERT INTO "roles" ("key", "display_name", "description", "rank") VALUES
  ('owner', 'House Owner', 'Owns the household lifecycle and billing.', 100),
  ('admin', 'Admin', 'Manages household settings without owning private member data.', 80),
  ('adult', 'Adult', 'Participates broadly in everyday household life.', 60),
  ('teen', 'Teen', 'Participates with configurable restrictions.', 40),
  ('child', 'Child', 'Uses a simplified, tightly controlled experience.', 20),
  ('guest', 'Guest', 'Has temporary or narrowly scoped access.', 10);

CREATE TABLE "memberships" (
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

CREATE INDEX "memberships_user_idx" ON "memberships" ("user_id", "status");
CREATE INDEX "memberships_household_idx" ON "memberships" ("household_id", "status");

CREATE TABLE "permissions" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "description" TEXT NOT NULL
);

INSERT INTO "permissions" ("key", "description") VALUES
  ('household.view', 'View the household and its shared resources.'),
  ('household.manage', 'Manage household settings and membership.'),
  ('household.delete', 'Archive or delete the household.'),
  ('members.invite', 'Invite new household members.'),
  ('members.manage', 'Change roles and member-level controls.'),
  ('calendar.manage', 'Create and manage shared calendar entries.'),
  ('tasks.manage', 'Create, assign and manage household tasks.'),
  ('groceries.manage', 'Create and manage household grocery lists.'),
  ('notes.manage', 'Create and manage shared household notes.'),
  ('audit.view', 'View security and administrative audit records.');

CREATE TABLE "role_permissions" (
  "role_key" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL DEFAULT 'allow' CHECK ("effect" IN ('allow', 'deny')),
  PRIMARY KEY ("role_key", "permission_key"),
  FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE CASCADE,
  FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE
);

INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
  ('owner', 'household.view'), ('owner', 'household.manage'), ('owner', 'household.delete'),
  ('owner', 'members.invite'), ('owner', 'members.manage'), ('owner', 'calendar.manage'),
  ('owner', 'tasks.manage'), ('owner', 'groceries.manage'), ('owner', 'notes.manage'), ('owner', 'audit.view'),
  ('admin', 'household.view'), ('admin', 'household.manage'), ('admin', 'members.invite'),
  ('admin', 'members.manage'), ('admin', 'calendar.manage'), ('admin', 'tasks.manage'),
  ('admin', 'groceries.manage'), ('admin', 'notes.manage'), ('admin', 'audit.view'),
  ('adult', 'household.view'), ('adult', 'calendar.manage'), ('adult', 'tasks.manage'),
  ('adult', 'groceries.manage'), ('adult', 'notes.manage'),
  ('teen', 'household.view'), ('teen', 'calendar.manage'), ('teen', 'tasks.manage'),
  ('teen', 'groceries.manage'),
  ('child', 'household.view'), ('child', 'tasks.manage'), ('child', 'groceries.manage'),
  ('guest', 'household.view');

CREATE TABLE "member_permission_overrides" (
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

CREATE TABLE "household_invites" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role_key" TEXT NOT NULL DEFAULT 'adult',
  "token_hash" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
  "invited_by" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT,
  FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX "household_invites_household_idx" ON "household_invites" ("household_id", "status");
CREATE INDEX "household_invites_email_idx" ON "household_invites" ("email", "status");

CREATE TABLE "audit_events" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "result" TEXT NOT NULL CHECK ("result" IN ('success', 'denied', 'failure')),
  "request_id" TEXT,
  "metadata_json" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL,
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX "audit_events_household_created_idx" ON "audit_events" ("household_id", "created_at");
