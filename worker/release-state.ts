import { Hono } from "hono";
import type { AppBindings } from "./http";

const app = new Hono<AppBindings>();

type ProductionReleaseState = {
  releaseId: string;
  releasedAt: string;
};

async function getProductionReleaseState(c: Parameters<typeof app.get>[1] extends (context: infer C) => unknown ? C : never) {
  return c.env.DB.prepare(
    "SELECT release_id AS releaseId, released_at AS releasedAt FROM production_release_state WHERE channel = 'production' LIMIT 1",
  ).first<ProductionReleaseState>();
}

app.get("/api/release-state", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const release = await getProductionReleaseState(c);

  return c.json({
    releaseId: release?.releaseId ?? null,
    releasedAt: release?.releasedAt ?? null,
  });
});

// Backward compatibility for browser tabs that still run the older update
// prompt. The old client polls /api/version and expects { id, tag, timestamp }.
// Return the last *verified Admin Release Center* marker here instead of the
// raw Cloudflare Worker version so ordinary pushes/deploys cannot trigger the
// legacy update banner.
app.get("/api/version", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const release = await getProductionReleaseState(c);

  return c.json({
    id: release?.releaseId ?? "no-verified-production-release",
    tag: "production-release",
    timestamp: release?.releasedAt ?? null,
  });
});

export default app;
