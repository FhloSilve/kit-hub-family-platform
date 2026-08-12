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

app.get("/api/v1/security/account-export", async c => {
  const access = await sessionUser(c); if ("error" in access) return access.error;
  const userId = access.session.user.id;
  const [profile, memberships, emailPrefs, sessions, events] = await Promise.all([
    c.env.DB.prepare("SELECT display_name displayName,preferred_language preferredLanguage,timezone,theme,startup_mode startupMode,created_at createdAt,updated_at updatedAt FROM profiles WHERE user_id=?").bind(userId).first<any>().catch(()=>null),
    c.env.DB.prepare(`SELECT h.name householdName,m.role_key role,m.status,m.joined_at joinedAt,m.created_at createdAt FROM memberships m JOIN households h ON h.id=m.household_id WHERE m.user_id=? ORDER BY m.created_at`).bind(userId).all<any>(),
    c.env.DB.prepare("SELECT welcome_opt_in welcomeOptIn,beta_updates_opt_in betaUpdatesOptIn,release_notes_opt_in releaseNotesOptIn,updated_at updatedAt FROM beta_email_preferences WHERE user_id=?").bind(userId).first<any>().catch(()=>null),
    c.env.DB.prepare("SELECT createdAt,updatedAt,expiresAt,userAgent FROM session WHERE userId=? ORDER BY updatedAt DESC LIMIT 50").bind(userId).all<any>(),
    c.env.DB.prepare("SELECT action,resource_type resourceType,result,created_at createdAt FROM audit_events WHERE actor_user_id=? ORDER BY created_at DESC LIMIT 250").bind(userId).all<any>(),
  ]);
  await c.env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), userId, "account.export", "account_security", "success", c.get("requestId") ?? null).run().catch(()=>undefined);
  return c.json({
    generatedAt: new Date().toISOString(),
    scope: "Kit Hub account/security export. Shared household content is intentionally not duplicated into this export yet.",
    account: { id:userId, name:access.session.user.name, email:access.session.user.email, createdAt:(access.session.user as any).createdAt ?? null, twoFactorEnabled:Boolean((access.session.user as any).twoFactorEnabled) },
    profile,
    memberships: memberships.results,
    betaEmailPreferences: emailPrefs ? { welcomeOptIn:Boolean(emailPrefs.welcomeOptIn), betaUpdatesOptIn:Boolean(emailPrefs.betaUpdatesOptIn), releaseNotesOptIn:Boolean(emailPrefs.releaseNotesOptIn), updatedAt:emailPrefs.updatedAt } : null,
    sessions: sessions.results.map((row:any)=>({ device:deviceLabel(row.userAgent ?? null), createdAt:Number(row.createdAt), updatedAt:Number(row.updatedAt), expiresAt:Number(row.expiresAt) })),
    securityEvents: events.results,
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
  const [denied, originBlocks, householdBlocks, rateLimits, authRateLimits, adminMutations, activeSessions, twoFactorUsers, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE result='denied' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='security.cross_origin_block' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='security.household_boundary' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action LIKE 'security.rate_limit.%' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action LIKE 'security.rate_limit.auth-%' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM audit_events WHERE action LIKE 'admin.%' AND created_at>=datetime('now','-7 day')").first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM session WHERE expiresAt>?").bind(Date.now()).first<{count:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM \"user\" WHERE \"twoFactorEnabled\"=1").first<{count:number}>(),
    c.env.DB.prepare("SELECT action,result,resource_type resourceType,created_at createdAt FROM audit_events WHERE action LIKE 'security.%' OR action LIKE 'admin.%' OR action LIKE 'account.%' OR action LIKE 'household.%reauth_required' ORDER BY created_at DESC LIMIT 20").all<any>(),
  ]);
  return c.json({
    windowDays: 7,
    metrics: {
      deniedRequests: Number(denied?.count ?? 0),
      crossOriginBlocks: Number(originBlocks?.count ?? 0),
      householdBoundaryBlocks: Number(householdBlocks?.count ?? 0),
      rateLimitBlocks: Number(rateLimits?.count ?? 0),
      authRateLimitBlocks: Number(authRateLimits?.count ?? 0),
      adminMutations: Number(adminMutations?.count ?? 0),
      activeSessions: Number(activeSessions?.count ?? 0),
      twoFactorUsers: Number(twoFactorUsers?.count ?? 0),
    },
    controls: [
      { key: "origin", label: "Same-origin mutation protection", enabled: true },
      { key: "authorization", label: "Central household permission enforcement", enabled: true },
      { key: "isolation", label: "Cross-household access guard", enabled: true },
      { key: "rate-limit", label: "Server-side mutation throttling", enabled: true },
      { key: "auth-rate-limit", label: "Authentication abuse throttling with hashed client buckets", enabled: true },
      { key: "two-factor", label: "Authenticator-app two-factor authentication + recovery codes", enabled: true },
      { key: "recent-auth", label: "Recent sign-in required for destructive account and production actions", enabled: true },
      { key: "upload-signature", label: "Attachment content-signature validation", enabled: true },
      { key: "audit", label: "Privacy-safe security audit trail", enabled: true },
      { key: "sessions", label: "Account session visibility + sign-out everywhere", enabled: true },
      { key: "account-export", label: "Account/security data export", enabled: true },
    ],
    recent: recent.results,
    privacyNote: "Security telemetry records event type, result, time, request reference and account/household identifiers where required for investigation. Authentication rate buckets use a one-way truncated SHA-256 client hash rather than storing the client IP in the bucket key. Passwords, two-factor secrets, backup codes, tokens and family content are never placed in security telemetry.",
  });
});

export default app;
