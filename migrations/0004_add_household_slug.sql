-- Add the household slug expected by the bootstrap and creation routes.
-- Existing production databases reached migration 0003 without this column.
-- The earlier migration baselines intentionally leave it for this migration so
-- a fresh database and the reconciled production database follow one path.

ALTER TABLE "households"
ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- Use the household id for a deterministic, collision-free legacy slug. New
-- households receive a readable name-based slug in the Worker creation route.
UPDATE "households"
SET "slug" = 'household-' || lower(replace("id", '-', ''))
WHERE "slug" = '';

CREATE UNIQUE INDEX "households_slug_idx" ON "households" ("slug");
