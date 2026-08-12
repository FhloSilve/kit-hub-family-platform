import { Hono } from "hono";
import type { AppBindings } from "./http";

const app = new Hono<AppBindings>();

type ProductionReleaseState = {
  releaseId: string;
  releasedAt: string;
};

async function getProductionReleaseState(db: AppBindings["Bindings"]["DB"]) {
  return db.prepare(
    "SELECT release_id AS releaseId, released_at AS releasedAt FROM production_release_state WHERE channel = 'production' LIMIT 1",
  ).first<ProductionReleaseState>();
}

app.get("/api/release-state", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const release = await getProductionReleaseState(c.env.DB);

  return c.json({
    releaseId: release?.releaseId ?? null,
    releasedAt: release?.releasedAt ?? null,
  });
});

app.get("/api/ready", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const schema = await c.env.DB.prepare(
    "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('production_release_state','api_security_rate_limits','twoFactor')",
  ).first<{ count: number }>().catch(() => null);
  const ready = Number(schema?.count ?? 0) === 3;
  const version = c.env.CF_VERSION_METADATA;

  return c.json(
    {
      status: ready ? "ready" : "not_ready",
      environment: c.env.APP_ENV,
      version: {
        id: version.id,
        tag: version.tag ?? null,
        timestamp: version.timestamp ?? null,
      },
    },
    ready ? 200 : 503,
  );
});

// Backward compatibility for browser tabs that still run the older update
// prompt. The old client polls /api/version and expects { id, tag, timestamp }.
// Return the last *verified Admin Release Center* marker here instead of the
// raw Cloudflare Worker version so ordinary pushes/deploys cannot trigger the
// legacy update banner.
app.get("/api/version", async (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const release = await getProductionReleaseState(c.env.DB);

  return c.json({
    id: release?.releaseId ?? "no-verified-production-release",
    tag: "production-release",
    timestamp: release?.releasedAt ?? null,
  });
});

export default app;
