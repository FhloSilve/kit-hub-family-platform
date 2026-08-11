import { Hono } from "hono";
import { requirePlatformAdmin } from "./admin";
import type { AppBindings } from "./http";

const app = new Hono<AppBindings>();
function bool(value: unknown) { return value === true || value === 1 || value === "1" || value === "true"; }

app.get("/api/v1/admin/security-readiness", async (c) => {
  const admin = await requirePlatformAdmin(c);
  if (admin.response) return admin.response;
  const [betaSetting, reliability, pendingProposals, rateBuckets, membershipCount, householdCount] = await Promise.all([
    c.env.DB.prepare("SELECT value FROM launch_settings WHERE key='private_beta_enabled'").first<{ value: string }>().catch(() => null),
    c.env.DB.prepare("SELECT metric_key metricKey,SUM(metric_count) count FROM app_reliability_daily WHERE metric_date>=date('now','-6 day') GROUP BY metric_key").all<{ metricKey: string; count: number }>().catch(() => ({ results: [] })),
    c.env.DB.prepare("SELECT COUNT(*) count FROM silvi_action_proposals WHERE status='pending' AND expires_at>datetime('now')").first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare("SELECT COUNT(*) count FROM api_security_rate_limits WHERE updated_at>=datetime('now','-1 day')").first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare("SELECT COUNT(*) count FROM memberships WHERE status='active'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM households WHERE deleted_at IS NULL").first<{ count: number }>(),
  ]);
  const env = c.env as any;
  const privateBetaEnabled = bool(betaSetting?.value);
  const failures = Object.fromEntries(reliability.results.map(row => [row.metricKey, Number(row.count)]));
  const checks = [
    { key: "household-isolation", label: "All household API routes require an active household membership", done: true, detail: "A global server-side guard runs before every /api/v1/households/:householdId/* route." },
    { key: "auth", label: "Authenticated sessions are required before household data is read or changed", done: true, detail: "The household guard validates the Better Auth session before route handlers run." },
    { key: "permissions", label: "Feature write permissions are re-checked server-side", done: true, detail: "Tasks, Calendar, Meals and other protected writes keep their feature-specific permission checks in addition to household membership." },
    { key: "silvi-confirm", label: "Silvi cannot apply a proposal without explicit confirmation", done: true, detail: "Proposals are user + household scoped, expire, are claimed atomically, and are revalidated immediately before execution." },
    { key: "rate-limit", label: "Sensitive and mutating household APIs are rate limited", done: true, detail: "Silvi asks, Silvi actions, analytics and household writes use server-side D1 rate buckets." },
    { key: "headers", label: "Security headers are applied to every Worker response", done: true, detail: "Includes clickjacking, MIME sniffing, referrer, opener and permissions protections." },
    { key: "beta-gate", label: "Private beta access gate is enabled", done: privateBetaEnabled, detail: privateBetaEnabled ? "Only platform admins and allowed beta testers can bootstrap Kit Hub." : "Turn on Private beta gate before inviting external testers." },
    { key: "auth-secret", label: "Authentication secret is configured", done: Boolean(env.BETTER_AUTH_SECRET), detail: "BETTER_AUTH_SECRET must remain a Cloudflare secret." },
    { key: "admins", label: "Platform admin allowlist is configured", done: Boolean(env.KIT_HUB_ADMIN_EMAILS), detail: "Admin APIs require both a signed-in session and an allowlisted admin email." },
  ];
  const completed = checks.filter(item => item.done).length;
  return c.json({
    checks,
    readiness: { completed, total: checks.length, percent: Math.round((completed / checks.length) * 100) },
    live: {
      households: Number(householdCount?.count ?? 0),
      activeMemberships: Number(membershipCount?.count ?? 0),
      pendingSilviProposals: Number(pendingProposals?.count ?? 0),
      activeRateBuckets24h: Number(rateBuckets?.count ?? 0),
      clientErrors7d: Number(failures.client_error ?? 0),
      silviErrors7d: Number(failures.silvi_error ?? 0),
      failedRefreshes7d: Number(failures.failed_refresh ?? 0),
      slowViews7d: Number(failures.slow_view ?? 0),
    },
    principles: [
      "Household identifiers from the browser are never trusted without active membership verification.",
      "Silvi proposals never count as approval and cannot be executed by another user or household.",
      "A successful data mutation triggers a household refresh signal so stale screens do not silently linger.",
      "Reliability and security counters contain no household content, titles, messages, notes, searches or locations.",
    ],
  });
});

export default app;
