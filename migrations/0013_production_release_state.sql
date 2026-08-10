-- Track only successfully completed production releases.
-- The in-app update prompt watches this marker rather than raw Worker versions,
-- so pushes or unrelated deployments do not create false update banners.

CREATE TABLE IF NOT EXISTS "production_release_state" (
  "channel" TEXT PRIMARY KEY NOT NULL,
  "release_id" TEXT NOT NULL,
  "released_at" TEXT NOT NULL DEFAULT (datetime('now'))
);
