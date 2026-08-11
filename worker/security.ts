import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";
import type { Context } from "hono";

export type SecurityContext = Context<AppBindings>;

type Limit = { key: string; max: number; windowMs: number };

function routeLimit(path: string, method: string): Limit | null {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return null;
  if (/\/silvi\/ask$/.test(path)) return { key: "silvi-ask", max: 40, windowMs: 10 * 60_000 };
  if (/\/silvi\/actions\//.test(path)) return { key: "silvi-action", max: 80, windowMs: 10 * 60_000 };
  if (/\/product-analytics$/.test(path)) return { key: "analytics", max: 240, windowMs: 10 * 60_000 };
  return { key: "household-write", max: 240, windowMs: 10 * 60_000 };
}

async function consumeLimit(c: SecurityContext, userId: string, householdId: string, limit: Limit) {
  const windowStart = Math.floor(Date.now() / limit.windowMs);
  const bucketKey = `${limit.key}:${householdId}:${userId}`;
  await c.env.DB.prepare(
    "INSERT INTO api_security_rate_limits(bucket_key,window_start,request_count,updated_at) VALUES(?,?,1,datetime('now')) ON CONFLICT(bucket_key,window_start) DO UPDATE SET request_count=api_security_rate_limits.request_count+1,updated_at=datetime('now')",
  ).bind(bucketKey, windowStart).run();
  const row = await c.env.DB.prepare(
    "SELECT request_count requestCount FROM api_security_rate_limits WHERE bucket_key=? AND window_start=?",
  ).bind(bucketKey, windowStart).first<{ requestCount: number }>();
  const count = Number(row?.requestCount ?? 0);
  if (count > limit.max) {
    const retrySeconds = Math.max(1, Math.ceil(((windowStart + 1) * limit.windowMs - Date.now()) / 1000));
    c.header("retry-after", String(retrySeconds));
    return apiError(c, 409, "RATE_LIMITED", "Too many changes were requested in a short period. Please wait a moment and try again.");
  }
  if (Math.random() < 0.02) {
    void c.env.DB.prepare("DELETE FROM api_security_rate_limits WHERE updated_at<datetime('now','-2 day')").run().catch(() => undefined);
  }
  return null;
}

export async function protectHouseholdRoute(c: SecurityContext, next: () => Promise<void>) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const householdId = c.req.param("householdId") ?? "";
  if (!householdId) return apiError(c, 404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.");
  const membership = await c.env.DB.prepare(
    "SELECT 1 allowed FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1",
  ).bind(householdId, session.user.id).first();
  if (!membership) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  const limit = routeLimit(new URL(c.req.url).pathname, c.req.method);
  if (limit) {
    const blocked = await consumeLimit(c, session.user.id, householdId, limit);
    if (blocked) return blocked;
  }
  await next();
}

export function applySecurityHeaders(c: SecurityContext) {
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
  c.header("x-frame-options", "DENY");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=(self)");
  c.header("cross-origin-opener-policy", "same-origin");
  c.header("cross-origin-resource-policy", "same-origin");
}
