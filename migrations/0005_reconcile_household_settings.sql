-- Reconcile the original production household schema with the fields used by
-- the current bootstrap and household-creation routes.
--
-- Keep the legacy language column in place. Renaming it makes SQLite reparse
-- every schema object and is blocked on legacy databases that contain an
-- unrelated malformed invite index. Adding and backfilling the new column
-- preserves the value without touching that index.

ALTER TABLE "households"
ADD COLUMN "default_language" TEXT NOT NULL DEFAULT 'en';

UPDATE "households"
SET "default_language" = "language"
WHERE "language" IS NOT NULL
  AND trim("language") <> '';

ALTER TABLE "households"
ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'meadow';

ALTER TABLE "households"
ADD COLUMN "deleted_at" TEXT;
