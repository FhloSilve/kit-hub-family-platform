-- Milestone 6: per-user household notification preferences and message mentions.

CREATE TABLE IF NOT EXISTS "household_notification_preferences" (
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "household_chat" INTEGER NOT NULL DEFAULT 0 CHECK ("household_chat" IN (0,1)),
  "announcements" INTEGER NOT NULL DEFAULT 1 CHECK ("announcements" IN (0,1)),
  "activity" INTEGER NOT NULL DEFAULT 0 CHECK ("activity" IN (0,1)),
  "calendar" INTEGER NOT NULL DEFAULT 1 CHECK ("calendar" IN (0,1)),
  "tasks" INTEGER NOT NULL DEFAULT 1 CHECK ("tasks" IN (0,1)),
  "groceries" INTEGER NOT NULL DEFAULT 0 CHECK ("groceries" IN (0,1)),
  "meals" INTEGER NOT NULL DEFAULT 1 CHECK ("meals" IN (0,1)),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("household_id", "user_id"),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "household_message_mentions" (
  "message_id" TEXT NOT NULL,
  "mentioned_user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("message_id", "mentioned_user_id"),
  FOREIGN KEY ("message_id") REFERENCES "household_messages"("id") ON DELETE CASCADE,
  FOREIGN KEY ("mentioned_user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "household_message_mentions_user_idx"
  ON "household_message_mentions" ("mentioned_user_id", "created_at" DESC);
