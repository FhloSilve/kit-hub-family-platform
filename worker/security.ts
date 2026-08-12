import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";
import type { Context } from "hono";

export type SecurityContext = Context<AppBindings>;
type Limit = { key: string; max: number; windowMs: number };

type HouseholdPermission =
  | "household.view"
  | "household.manage"
  | "members.invite"
  | "members.manage"
  | "calendar.manage"
  | "tasks.manage"
  | "groceries.manage"
  | "notes.manage"
  | "meals.manage";

function isUnsafe(method: string) { return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()); }

function routeLimit(path: string, method: string): Limit | null {
  if (!isUnsafe(method)) return null;
  if (/\/silvi\/ask$/.test(path)) return { key: "silvi-ask", max: 40, windowMs: 10 * 60_000 };
  if (/\/silvi\/actions\//.test(path)) return { key: "silvi-action", max: 80, windowMs: 10 * 60_000 };
  if (/\/product-analytics$/.test(path)) return { key: "analytics", max: 240, windowMs: 10 * 60_000 };
  if (/\/feedback$/.test(path)) return { key: "feedback", max: 20, windowMs: 60 * 60_000 };
  return { key: "household-write", max: 240, windowMs: 10 * 60_000 };
}

function authLimit(path: string, method: string): Limit | null {
  if (!isUnsafe(method)) return null;
  const p = path.toLowerCase();
  if (p.includes("/sign-up/")) return { key: "auth-sign-up", max: 8, windowMs: 60 * 60_000 };
  if (p.includes("/sign-in/")) return { key: "auth-sign-in", max: 20, windowMs: 15 * 60_000 };
  if (p.includes("password") || p.includes("reset")) return { key: "auth-recovery", max: 10, windowMs: 60 * 60_000 };
  return { key: "auth-write", max: 30, windowMs: 15 * 60_000 };
}

function routePermission(path: string, method: string): HouseholdPermission | null {
  if (!isUnsafe(method)) return null;
  if (/\/members(?:\/|$)/.test(path)) return "members.manage";
  if (/\/invites?(?:\/|$)/.test(path)) return "members.invite";
  if (/\/tasks(?:\/|$)/.test(path) || /\/routines(?:\/|$)/.test(path)) return "tasks.manage";
  if (/\/groceries(?:\/|$)/.test(path)) return "groceries.manage";
  if (/\/(?:events|calendar)(?:\/|$)/.test(path)) return "calendar.manage";
  if (/\/(?:notes|focus)(?:\/|$)/.test(path)) return "notes.manage";
  if (/\/meals(?:\/|$)/.test(path)) return "meals.manage";
  return null;
}

async function audit(c: SecurityContext, input: { householdId?: string | null; userId?: string | null; action: string; resourceType: string; result: "success" | "denied" | "failure" }) {
  await c.env.DB.prepare(
    "INSERT INTO audit_events(id,household_id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))",
  ).bind(crypto.randomUUID(), input.householdId ?? null, input.userId ?? null, input.action, input.resourceType, input.result, c.get("requestId") ?? null).run().catch(() => undefined);
}

async function digest(value: string) {
  const data = new TextEncoder().encode(value);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(bytes.slice(0, 16)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function clientAddress(c: SecurityContext) {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function protectUnsafeOrigin(c: SecurityContext, next: () => Promise<void>) {
  if (!isUnsafe(c.req.method) || !new URL(c.req.url).pathname.startsWith("/api/")) return next();
  const requestUrl = new URL(c.req.url);
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site")?.toLowerCase();
  const originMatches = !origin || origin === requestUrl.origin;
  const fetchSiteAllowed = !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  if (!originMatches || !fetchSiteAllowed) {
    await audit(c, { action: "security.cross_origin_block", resourceType: "request", result: "denied" });
    return apiError(c, 403, "ORIGIN_NOT_ALLOWED", "This request did not come from the Kit Hub application.");
  }
  await next();
}

async function consumeLimit(c: SecurityContext, subject: string, limit: Limit, householdId?: string | null, userId?: string | null) {
  const windowStart = Math.floor(Date.now() / limit.windowMs);
  const bucketKey = `${limit.key}:${subject}`;
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
    await audit(c, { householdId, userId, action: `security.rate_limit.${limit.key}`, resourceType: "request", result: "denied" });
    return apiError(c, 429, "RATE_LIMITED", "Too many requests were made in a short period. Please wait and try again.");
  }
  if (Math.random() < 0.02) void c.env.DB.prepare("DELETE FROM api_security_rate_limits WHERE updated_at<datetime('now','-2 day')").run().catch(() => undefined);
  return null;
}

export async function protectAuthRoute(c: SecurityContext, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname;
  const limit = authLimit(path, c.req.method);
  if (!limit) return next();
  const addressHash = await digest(clientAddress(c));
  const blocked = await consumeLimit(c, `client:${addressHash}`, limit);
  if (blocked) return blocked;
  await next();
}

export async function hasHouseholdPermission(c: SecurityContext, householdId: string, userId: string, permission: HouseholdPermission) {
  const override = await c.env.DB.prepare(
    "SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key=? LIMIT 1",
  ).bind(householdId, userId, permission).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";
  const role = await c.env.DB.prepare(
    `SELECT rp.effect FROM memberships m JOIN role_permissions rp ON rp.role_key=m.role_key
     WHERE m.household_id=? AND m.user_id=? AND m.status='active' AND rp.permission_key=? LIMIT 1`,
  ).bind(householdId, userId, permission).first<{ effect: "allow" | "deny" }>();
  return role?.effect === "allow";
}

export async function protectHouseholdRoute(c: SecurityContext, next: () => Promise<void>) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const householdId = c.req.param("householdId") ?? "";
  if (!householdId) return apiError(c, 404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.");
  const membership = await c.env.DB.prepare(
    "SELECT role_key roleKey FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1",
  ).bind(householdId, session.user.id).first<{ roleKey: string }>();
  if (!membership) {
    await audit(c, { householdId, userId: session.user.id, action: "security.household_boundary", resourceType: "household", result: "denied" });
    return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  }
  const path = new URL(c.req.url).pathname;
  const required = routePermission(path, c.req.method);
  if (required && !(await hasHouseholdPermission(c, householdId, session.user.id, required))) {
    await audit(c, { householdId, userId: session.user.id, action: `permission.denied.${required}`, resourceType: "household", result: "denied" });
    return apiError(c, 403, "HOUSEHOLD_PERMISSION_REQUIRED", "Your household role does not allow that change.");
  }
  const limit = routeLimit(path, c.req.method);
  if (limit) {
    const blocked = await consumeLimit(c, `${householdId}:${session.user.id}`, limit, householdId, session.user.id);
    if (blocked) return blocked;
  }
  await next();
}

export async function auditAdminMutation(c: SecurityContext, next: () => Promise<void>) {
  await next();
  if (!isUnsafe(c.req.method)) return;
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  await audit(c, { userId: session?.user?.id ?? null, action: "admin.mutation", resourceType: "platform_admin", result: c.res.status < 400 ? "success" : "failure" });
}

export function applySecurityHeaders(c: SecurityContext) {
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
  c.header("x-frame-options", "DENY");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=(self)");
  c.header("cross-origin-opener-policy", "same-origin");
  c.header("cross-origin-resource-policy", "same-origin");
  c.header("x-permitted-cross-domain-policies", "none");
  c.header("content-security-policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}
