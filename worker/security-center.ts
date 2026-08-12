import { Hono } from "hono";
import { createAuth } from "./auth";
import { requirePlatformAdmin } from "./admin";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();

async function sessionUser(c: any) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { error: apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.") } as const;
  return { session } as const;
}

function deviceLabel(agent: string | null) {
  if (!agent) return "Unknown device";
  const lower = agent.toLowerCase();
  const device = /iphone|ipad/.test(lower) ? "Apple mobile device" : /android/.test(lower) ? "Android device" : /windows/.test(lower) ? "Windows device" : /mac os|macintosh/.test(lower) ? "Mac" : /linux/.test(lower) ? "Linux device" : "Browser device";
  const browser = /edg\//.test(lower) ? "Edge" : /chrome\//.test(lower) ? "Chrome" : /firefox\//.test(lower) ? "Firefox" : /safari\//.test(lower) ? "Safari" : "browser";
  return `${device} · ${browser}`;
}

app.get("/api/v1/security/sessions", async c => {
  const access = await sessionUser(c); if ("error" in access) return access.error;
  const rows = await c.env.DB.prepare(
    `SELECT id,createdAt,updatedAt,expiresAt,userAgent FROM session WHERE userId=? ORDER BY updatedAt DESC LIMIT 20`,
  ).bind(access.session.user.id).all<any>();
  return c.json({
    sessions: rows.results.map((row:any) => ({
      id: row.id,
      device: deviceLabel(row.userAgent ?? null),
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      expiresAt: Number(row.expiresAt),
    })),
    note: "Kit Hub intentionally does not expose stored IP addresses in the account UI.",
  });
});

app.post("/api/v1/security/sign-out-everywhere", async c => {
  const access = await sessionUser(c); if ("error" in access) return access.error;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM session WHERE userId=?").bind(access.session.user.id),
    c.env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
      .bind(crypto.randomUUID(), access.session.user.id, "account.sign_out_everywhere", "account_security", "success", c.get("requestId") ?? null),
  ]);
  return c.json({ signedOut: true });
});

app.get("/api/v1/admin/security-center", async c => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const [denied, originBlocks, householdBlocks, rateLimits, adminMutations, activeSessions, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE result='denied' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='security.cross_origin_block' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='security.household_boundary' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action LIKE 'security.rate_limit.%' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='admin.mutation' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM session WHERE expiresAt>?").bind(Date.now()).first<{count:number}>(),
    c.env.DB.prepare("SELECT action,result,resource_type resourceType,created_at createdAt FROM audit_events WHERE action LIKE 'security.%' OR action='admin.mutation' OR action='account.sign_out_everywhere' ORDER BY created_at DESC LIMIT 20").all<any>(),
  ]);
  return c.json({
    windowDays: 7,
    metrics: {
      deniedRequests: Number(denied?.count ?? 0),
      crossOriginBlocks: Number(originBlocks?.count ?? 0),
      householdBoundaryBlocks: Number(householdBlocks?.count ?? 0),
      rateLimitBlocks: Number(rateLimits?.count ?? 0),
      adminMutations: Number(adminMutations?.count ?? 0),
      activeSessions: Number(activeSessions?.count ?? 0),
    },
    controls: [
      { key: "origin", label: "Same-origin mutation protection", enabled: true },
      { key: "authorization", label: "Central household permission enforcement", enabled: true },
      { key: "isolation", label: "Cross-household access guard", enabled: true },
      { key: "rate-limit", label: "Server-side mutation throttling", enabled: true },
      { key: "audit", label: "Privacy-safe security audit trail", enabled: true },
      { key: "sessions", label: "Account session visibility + sign-out everywhere", enabled: true },
    ],
    recent: recent.results,
    privacyNote: "Security telemetry records event type, result, time, request reference and account/household identifiers where required for investigation. It never stores passwords, tokens, messages, notes, searches, meal names or location coordinates.",
  });
});

export default app;
