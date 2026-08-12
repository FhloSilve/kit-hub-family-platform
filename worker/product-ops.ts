import { Hono } from "hono";
import { createAuth } from "./auth";
import { isPlatformAdmin, requirePlatformAdmin } from "./admin";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

const usageKeys = new Set([
  "app_open",
  "dashboard_view",
  "calendar_view",
  "tasks_view",
  "groceries_view",
  "meals_view",
  "family_hub_view",
  "family_plan_view",
  "routines_view",
  "search_used",
  "feedback_opened",
  "silvi_opened",
]);
const settingKeys = new Set([
  "private_beta_enabled",
  "public_landing_ready",
  "legal_privacy_ready",
  "email_communication_ready",
]);
const roadmapStatuses = new Set(["planned", "building", "testing", "ready"]);
const testerStatuses = new Set(["invited", "active", "paused"]);

async function signedInHousehold(c: Ctx, householdId: string) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { error: apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.") } as const;
  const member = await c.env.DB.prepare(
    "SELECT 1 allowed FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1",
  ).bind(householdId, session.user.id).first();
  if (!member) return { error: apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.") } as const;
  return { session } as const;
}

function boolValue(value: unknown) { return value === true || value === "true" || value === 1 || value === "1"; }
function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function privateBetaAccess(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { allowed: true, session: null };
  if (isPlatformAdmin(c.env, session.user.email)) return { allowed: true, session };
  const setting = await c.env.DB.prepare("SELECT value FROM launch_settings WHERE key='private_beta_enabled'").first<{ value: string }>().catch(() => null);
  if (!boolValue(setting?.value)) return { allowed: true, session };
  const tester = await c.env.DB.prepare(
    "SELECT status FROM beta_tester_allowlist WHERE lower(email)=lower(?) LIMIT 1",
  ).bind(session.user.email).first<{ status: string }>();
  return { allowed: tester?.status === "invited" || tester?.status === "active", session };
}

export async function markBetaTesterActive(c: Ctx, email: string) {
  await c.env.DB.prepare(
    "UPDATE beta_tester_allowlist SET status='active', activated_at=COALESCE(activated_at,datetime('now')), updated_at=datetime('now') WHERE lower(email)=lower(?) AND status!='paused'",
  ).bind(email).run().catch(() => undefined);
}

app.post("/api/v1/households/:householdId/product-analytics", async (c) => {
  const householdId = c.req.param("householdId") ?? "";
  const access = await signedInHousehold(c, householdId);
  if ("error" in access) return access.error;
  const body = await c.req.json().catch(() => null) as { eventKey?: unknown } | null;
  const eventKey = cleanText(body?.eventKey, 60);
  if (!usageKeys.has(eventKey)) return apiError(c, 422, "ANALYTICS_EVENT_NOT_ALLOWED", "That analytics event is not part of Kit Hub's privacy-safe event list.");
  const day = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare(
    `INSERT INTO product_usage_daily(household_id,usage_date,event_key,event_count,first_seen_at,last_seen_at)
     VALUES(?,?,?,1,datetime('now'),datetime('now'))
     ON CONFLICT(household_id,usage_date,event_key) DO UPDATE SET
       event_count=product_usage_daily.event_count+1,
       last_seen_at=datetime('now')`,
  ).bind(householdId, day, eventKey).run();
  return c.json({ recorded: true });
});

app.get("/api/v1/admin/product-ops", async (c) => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const [roadmap, testers, settings, totalHouseholds, activeToday, active7, featureRows, feedbackCount, retention, activityCount] = await Promise.all([
    c.env.DB.prepare("SELECT id,title,description,status,sort_order sortOrder,updated_at updatedAt FROM launch_roadmap_items ORDER BY sort_order,title").all(),
    c.env.DB.prepare(`SELECT t.email,t.display_name displayName,t.status,t.notes,t.invited_at invitedAt,t.activated_at activatedAt,t.updated_at updatedAt,
      (SELECT MAX(l.created_at) FROM beta_email_delivery_log l WHERE lower(l.email)=lower(t.email) AND l.template_key='welcome' AND l.status='sent') welcomeSentAt
      FROM beta_tester_allowlist t ORDER BY t.invited_at DESC`).all(),
    c.env.DB.prepare("SELECT key,value,updated_at updatedAt FROM launch_settings ORDER BY key").all(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM households WHERE deleted_at IS NULL").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(DISTINCT household_id) count FROM product_usage_daily WHERE usage_date=date('now')").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(DISTINCT household_id) count FROM product_usage_daily WHERE usage_date>=date('now','-6 day')").first<{ count: number }>(),
    c.env.DB.prepare(`SELECT event_key eventKey,SUM(event_count) count FROM product_usage_daily WHERE usage_date>=date('now','-29 day') AND event_key NOT IN ('app_open','dashboard_view') GROUP BY event_key ORDER BY count DESC LIMIT 8`).all(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM tester_feedback").first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(`WITH firsts AS (
      SELECT household_id, MIN(usage_date) firstDay FROM product_usage_daily GROUP BY household_id
    ), eligible AS (
      SELECT household_id, firstDay FROM firsts WHERE firstDay<=date('now','-7 day')
    )
    SELECT COUNT(*) eligible,
      SUM(CASE WHEN EXISTS(
        SELECT 1 FROM product_usage_daily p
        WHERE p.household_id=e.household_id AND p.usage_date>=date(e.firstDay,'+7 day')
      ) THEN 1 ELSE 0 END) retained
    FROM eligible e`).first<{ eligible: number; retained: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM product_usage_daily").first<{ count: number }>(),
  ]);
  const settingMap = Object.fromEntries((settings.results as Array<{ key: string; value: string }>).map((row) => [row.key, boolValue(row.value)]));
  const betaListReady = testers.results.length > 0;
  const retentionEligible = Number(retention?.eligible ?? 0);
  const retained = Number(retention?.retained ?? 0);
  const testerRows = testers.results as Array<{ status:string; activatedAt:string|null; welcomeSentAt:string|null }>;
  const invitationProgress = {
    total: testerRows.length,
    invited: testerRows.filter((row) => row.status === "invited").length,
    active: testerRows.filter((row) => row.status === "active").length,
    paused: testerRows.filter((row) => row.status === "paused").length,
    welcomeSent: testerRows.filter((row) => Boolean(row.welcomeSentAt)).length,
    activated: testerRows.filter((row) => Boolean(row.activatedAt)).length,
  };
  const checklist = [
    { key: "roadmap", label: "Product roadmap is visible in Admin", done: roadmap.results.length >= 4 },
    { key: "analytics", label: "Privacy-safe product analytics are installed", done: true },
    { key: "feedback", label: "Tester feedback loop is available", done: feedbackCount !== null },
    { key: "beta", label: "Private beta tester list is prepared", done: betaListReady },
    { key: "retention", label: "Enough usage exists to measure 7-day return", done: retentionEligible > 0 },
    { key: "landing", label: "Public product / landing page is ready", done: Boolean(settingMap.public_landing_ready) },
    { key: "legal", label: "Privacy and legal launch copy is ready", done: Boolean(settingMap.legal_privacy_ready) },
    { key: "email", label: "Onboarding / update email communication is ready", done: Boolean(settingMap.email_communication_ready) },
  ];
  const completed = checklist.filter((item) => item.done).length;
  return c.json({
    roadmap: roadmap.results,
    testers: testers.results,
    invitationProgress,
    settings: settingMap,
    checklist,
    readiness: { completed, total: checklist.length, percent: Math.round((completed / checklist.length) * 100) },
    analytics: {
      totalHouseholds: Number(totalHouseholds?.count ?? 0),
      activeToday: Number(activeToday?.count ?? 0),
      active7Days: Number(active7?.count ?? 0),
      trackedDailyRows: Number(activityCount?.count ?? 0),
      retentionEligible,
      retained,
      retention7DayPercent: retentionEligible ? Math.round((retained / retentionEligible) * 100) : null,
      topFeatures: featureRows.results.map((row: any) => ({ eventKey: row.eventKey, count: Number(row.count) })),
    },
    feedbackCount: Number(feedbackCount?.count ?? 0),
    privacyNote: "Kit Hub analytics store only household/day/event counters from a fixed event list. They do not store message text, notes, searches, location, event titles, task titles or other family content.",
  });
});

app.patch("/api/v1/admin/product-ops/roadmap/:itemId", async (c) => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const body = await c.req.json().catch(() => null) as { status?: unknown } | null;
  const status = cleanText(body?.status, 20);
  if (!roadmapStatuses.has(status)) return apiError(c, 422, "ROADMAP_STATUS_INVALID", "Choose Planned, Building, Testing or Ready.");
  const result = await c.env.DB.prepare("UPDATE launch_roadmap_items SET status=?,updated_at=datetime('now') WHERE id=?").bind(status, c.req.param("itemId")).run();
  if (!result.meta.changes) return apiError(c, 404, "ROADMAP_ITEM_NOT_FOUND", "That roadmap item could not be found.");
  return c.json({ updated: true });
});

app.post("/api/v1/admin/product-ops/beta-testers", async (c) => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const body = await c.req.json().catch(() => null) as { email?: unknown; displayName?: unknown; notes?: unknown } | null;
  const email = cleanText(body?.email, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError(c, 422, "BETA_EMAIL_INVALID", "Enter a valid tester email address.");
  const displayName = cleanText(body?.displayName, 100) || null;
  const notes = cleanText(body?.notes, 500) || null;
  await c.env.DB.prepare(`INSERT INTO beta_tester_allowlist(email,display_name,status,notes,invited_at,updated_at)
    VALUES(?,?,'invited',?,datetime('now'),datetime('now'))
    ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,notes=excluded.notes,status=CASE WHEN beta_tester_allowlist.status='active' THEN 'active' ELSE 'invited' END,updated_at=datetime('now')`)
    .bind(email, displayName, notes).run();
  return c.json({ saved: true, email }, 201);
});

app.patch("/api/v1/admin/product-ops/beta-testers/:email", async (c) => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const body = await c.req.json().catch(() => null) as { status?: unknown } | null;
  const status = cleanText(body?.status, 20);
  if (!testerStatuses.has(status)) return apiError(c, 422, "BETA_STATUS_INVALID", "Choose Invited, Active or Paused.");
  const result = await c.env.DB.prepare("UPDATE beta_tester_allowlist SET status=?,updated_at=datetime('now') WHERE lower(email)=lower(?)").bind(status, decodeURIComponent(c.req.param("email"))).run();
  if (!result.meta.changes) return apiError(c, 404, "BETA_TESTER_NOT_FOUND", "That beta tester could not be found.");
  return c.json({ updated: true });
});

app.put("/api/v1/admin/product-ops/settings/:key", async (c) => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const key = c.req.param("key");
  if (!settingKeys.has(key)) return apiError(c, 404, "LAUNCH_SETTING_NOT_FOUND", "That launch setting is not available.");
  const body = await c.req.json().catch(() => null) as { value?: unknown } | null;
  if (typeof body?.value !== "boolean") return apiError(c, 422, "LAUNCH_SETTING_INVALID", "This launch setting must be on or off.");
  await c.env.DB.prepare(`INSERT INTO launch_settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')`).bind(key, body.value ? "true" : "false").run();
  return c.json({ key, value: body.value });
});

export default app;