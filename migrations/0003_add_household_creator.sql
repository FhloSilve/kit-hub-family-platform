-- Reconcile databases where created_by was added before Wrangler recorded
-- this migration. The fresh-install baseline now creates the column in 0001;
-- production already has it, so this migration only backfills legacy rows and
-- allows Wrangler to record 0003 normally.

UPDATE "households"
SET "created_by" = (
  SELECT "memberships"."user_id"
  FROM "memberships"
  WHERE "memberships"."household_id" = "households"."id"
    AND "memberships"."role_key" = 'owner'
  ORDER BY "memberships".rowid ASC
  LIMIT 1
)
WHERE "created_by" IS NULL;
