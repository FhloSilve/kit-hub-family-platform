-- Milestone 6: household communication, announcements, read state and activity feed.

INSERT OR IGNORE INTO permissions ("key", "description") VALUES
  ('communication.send', 'Send messages in the household chat.'),
  ('announcements.manage', 'Create and manage household announcements.');

INSERT OR IGNORE INTO role_permissions ("role_key", "permission_key") VALUES
  ('owner', 'communication.send'),
  ('admin', 'communication.send'),
  ('adult', 'communication.send'),
  ('teen', 'communication.send'),
  ('child', 'communication.send'),
  ('owner', 'announcements.manage'),
  ('admin', 'announcements.manage'),
  ('adult', 'announcements.manage');

CREATE TABLE IF NOT EXISTS "household_messages" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 1000),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "edited_at" TEXT,
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "household_messages_household_created_idx"
  ON "household_messages" ("household_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "household_message_reads" (
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "last_read_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("household_id", "user_id"),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "household_announcements" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 120),
  "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 1200),
  "pinned" INTEGER NOT NULL DEFAULT 1 CHECK ("pinned" IN (0, 1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "household_announcements_household_pinned_idx"
  ON "household_announcements" ("household_id", "pinned" DESC, "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "household_activity" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "kind" TEXT NOT NULL CHECK (length("kind") BETWEEN 1 AND 50),
  "summary" TEXT NOT NULL CHECK (length("summary") BETWEEN 1 AND 300),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "household_activity_household_created_idx"
  ON "household_activity" ("household_id", "created_at" DESC);
