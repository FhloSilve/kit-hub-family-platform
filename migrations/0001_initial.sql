PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" INTEGER DEFAULT 0 NOT NULL,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" ("token");
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "household" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "created_by" TEXT NOT NULL REFERENCES "user"("id"),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "household_member" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('owner', 'admin', 'member', 'child')),
  "display_name" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE ("household_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "household_member_user_idx" ON "household_member" ("user_id");

CREATE TABLE IF NOT EXISTS "task" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT DEFAULT 'todo' NOT NULL CHECK ("status" IN ('todo', 'done')),
  "priority" TEXT DEFAULT 'normal' NOT NULL CHECK ("priority" IN ('low', 'normal', 'high')),
  "due_at" INTEGER,
  "assignee_member_id" TEXT REFERENCES "household_member"("id") ON DELETE SET NULL,
  "created_by" TEXT NOT NULL REFERENCES "user"("id"),
  "visibility" TEXT DEFAULT 'household' NOT NULL CHECK ("visibility" IN ('household', 'admin', 'private')),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "task_household_status_idx" ON "task" ("household_id", "status", "due_at");

CREATE TABLE IF NOT EXISTS "grocery_item" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "quantity" TEXT DEFAULT '1' NOT NULL,
  "checked" INTEGER DEFAULT 0 NOT NULL,
  "added_by" TEXT NOT NULL REFERENCES "user"("id"),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "grocery_household_checked_idx" ON "grocery_item" ("household_id", "checked", "created_at");

CREATE TABLE IF NOT EXISTS "event" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "starts_at" INTEGER NOT NULL,
  "ends_at" INTEGER,
  "all_day" INTEGER DEFAULT 0 NOT NULL,
  "created_by" TEXT NOT NULL REFERENCES "user"("id"),
  "visibility" TEXT DEFAULT 'household' NOT NULL CHECK ("visibility" IN ('household', 'admin', 'private')),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "event_household_starts_idx" ON "event" ("household_id", "starts_at");

CREATE TABLE IF NOT EXISTS "note" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "body" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT NOT NULL REFERENCES "user"("id"),
  "visibility" TEXT DEFAULT 'private' NOT NULL CHECK ("visibility" IN ('household', 'admin', 'private')),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "note_household_updated_idx" ON "note" ("household_id", "updated_at");

CREATE TABLE IF NOT EXISTS "channel" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "kind" TEXT DEFAULT 'household' NOT NULL CHECK ("kind" IN ('household', 'direct')),
  "created_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "message" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "channel_id" TEXT NOT NULL REFERENCES "channel"("id") ON DELETE CASCADE,
  "sender_member_id" TEXT NOT NULL REFERENCES "household_member"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "edited_at" INTEGER
);
CREATE INDEX IF NOT EXISTS "message_channel_created_idx" ON "message" ("channel_id", "created_at");
