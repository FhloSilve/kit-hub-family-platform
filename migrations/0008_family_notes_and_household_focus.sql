-- Shared family notes and one active focus per household.

CREATE TABLE IF NOT EXISTS "family_notes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 500),
  "author_user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "family_notes_household_updated_idx"
  ON "family_notes" ("household_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "household_focus" (
  "household_id" TEXT PRIMARY KEY NOT NULL,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 80),
  "details" TEXT CHECK ("details" IS NULL OR length("details") <= 400),
  "updated_by_user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("updated_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT
);
