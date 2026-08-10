-- Milestone 6: per-user notification preferences.
-- Direct messages, mentions, and personally relevant items are treated as essential and remain enabled.

CREATE TABLE IF NOT EXISTS "household_notification_preferences" (
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "household_chat" INTEGER NOT NULL DEFAULT 0 CHECK ("household_chat" IN (0,1)),
  "announcements" INTEGER NOT NULL DEFAULT 1 CHECK ("announcements" IN (0,1)),
  "tasks" INTEGER NOT NULL DEFAULT 1 CHECK ("tasks" IN (0,1)),
  "groceries" INTEGER NOT NULL DEFAULT 0 CHECK ("groceries" IN (0,1)),
  "calendar" INTEGER NOT NULL DEFAULT 1 CHECK ("calendar" IN (0,1)),
  "meals" INTEGER NOT NULL DEFAULT 1 CHECK ("meals" IN (0,1)),
  "activity" INTEGER NOT NULL DEFAULT 0 CHECK ("activity" IN (0,1)),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("household_id", "user_id"),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
