-- Milestone 2: Everyday Core
-- Uses namespaced tables so production databases that contain the retired
-- prototype schema can migrate safely without colliding with old table names.

CREATE TABLE IF NOT EXISTS "everyday_tasks" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'todo' CHECK ("status" IN ('todo', 'done')),
  "priority" TEXT NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low', 'normal', 'high')),
  "due_at" TEXT,
  "assignee_user_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("assignee_user_id") REFERENCES "user"("id") ON DELETE SET NULL,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "everyday_tasks_household_status_idx"
  ON "everyday_tasks" ("household_id", "status", "due_at");

CREATE TABLE IF NOT EXISTS "everyday_grocery_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" TEXT NOT NULL DEFAULT '1',
  "checked" INTEGER NOT NULL DEFAULT 0 CHECK ("checked" IN (0, 1)),
  "added_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("added_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "everyday_grocery_household_checked_idx"
  ON "everyday_grocery_items" ("household_id", "checked", "created_at");

CREATE TABLE IF NOT EXISTS "everyday_events" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "starts_at" TEXT NOT NULL,
  "ends_at" TEXT,
  "all_day" INTEGER NOT NULL DEFAULT 0 CHECK ("all_day" IN (0, 1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "everyday_events_household_starts_idx"
  ON "everyday_events" ("household_id", "starts_at");
