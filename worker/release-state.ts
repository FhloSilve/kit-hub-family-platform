import { Hono } from "hono";
import type { AppBindings } from "./http";

const app = new Hono<AppBindings>();

app.get("/api/release-state", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const release = await c.env.DB.prepare(
    "SELECT release_id AS releaseId, released_at AS releasedAt FROM production_release_state WHERE channel = 'production' LIMIT 1",
  ).first<{ releaseId: string; releasedAt: string }>();

  return c.json({
    releaseId: release?.releaseId ?? null,
    releasedAt: release?.releasedAt ?? null,
  });
});

export default app;
