-- First-test-user feedback: issues and suggestions with optional screenshot evidence.
CREATE TABLE IF NOT EXISTS "tester_feedback" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('issue','suggestion')),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
  "description" TEXT NOT NULL CHECK (length("description") BETWEEN 1 AND 3000),
  "details" TEXT CHECK ("details" IS NULL OR length("details") <= 3000),
  "error_text" TEXT CHECK ("error_text" IS NULL OR length("error_text") <= 4000),
  "page_url" TEXT CHECK ("page_url" IS NULL OR length("page_url") <= 1000),
  "user_agent" TEXT CHECK ("user_agent" IS NULL OR length("user_agent") <= 1000),
  "status" TEXT NOT NULL DEFAULT 'new' CHECK ("status" IN ('new','reviewing','planned','fixed','closed')),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "tester_feedback_household_created_idx" ON "tester_feedback" ("household_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "tester_feedback_screenshots" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "feedback_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL CHECK (length("file_name") BETWEEN 1 AND 180),
  "mime_type" TEXT NOT NULL CHECK ("mime_type" IN ('image/png','image/jpeg','image/webp')),
  "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" BETWEEN 1 AND 1572864),
  "data_base64" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("feedback_id") REFERENCES "tester_feedback"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "tester_feedback_screenshots_feedback_idx" ON "tester_feedback_screenshots" ("feedback_id", "created_at");