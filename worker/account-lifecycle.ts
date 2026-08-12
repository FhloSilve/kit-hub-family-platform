import { Hono, type Context } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Context<AppBindings>;

async function current(c: Ctx) {
 const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
 if (!session?.user) return null;
 return session;
}

async function audit(c: Ctx, userId: string, action: string, result: "success" | "denied" | "failure") {
 await c.env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
  .bind(crypto.randomUUID(), userId, action, "account_lifecycle", result, c.get("requestId") ?? null)
  .run()
  .catch(() => undefined);
}

async function status(c: Ctx, userId: string) {
 const [owned, memberships, pending] = await Promise.all([
  c.env.DB.prepare("SELECT h.id,h.name FROM memberships m JOIN households h ON h.id=m.household_id WHERE m.user_id=? AND m.status='active' AND m.role_key='owner' AND h.deleted_at IS NULL ORDER BY h.name")
   .bind(userId)
   .all<{ id: string; name: string }>(),
  c.env.DB.prepare("SELECT COUNT(*) count FROM memberships WHERE user_id=? AND status='active'")
   .bind(userId)
   .first<{ count: number }>(),
  c.env.DB.prepare("SELECT status,requested_at requestedAt,earliest_delete_at earliestDeleteAt,cancelled_at cancelledAt,reason_code reasonCode FROM account_deletion_requests WHERE user_id=?")
   .bind(userId)
   .first<{ status: string; requestedAt: string; earliestDeleteAt: string; cancelledAt: string | null; reasonCode: string | null }>()
   .catch(() => null),
 ]);
 const blockers = owned.results.map(row => ({
  code: "OWNS_HOUSEHOLD",
  householdId: row.id,
  label: `Transfer ownership or delete ${row.name} first.`,
 }));
 return {
  canRequest: blockers.length === 0,
  blockers,
  activeMemberships: Number(memberships?.count ?? 0),
  request: pending ?? null,
  coolingOffHours: 24,
  note: "Kit Hub uses a cooling-off request before permanent account deletion. Shared household ownership must be resolved first so family data is not orphaned.",
 };
}

app.get("/api/v1/security/account-deletion", async c => {
 const session = await current(c);
 if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
 return c.json(await status(c, session.user.id));
});

app.post("/api/v1/security/account-deletion", async c => {
 const session = await current(c);
 if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
 const body = await c.req.json().catch(() => null) as { confirmation?: unknown; email?: unknown } | null;
 if (body?.confirmation !== "DELETE MY ACCOUNT" || String(body?.email ?? "").toLowerCase() !== String(session.user.email).toLowerCase()) {
  return apiError(c, 422, "DELETION_CONFIRMATION_REQUIRED", "Type DELETE MY ACCOUNT and confirm your signed-in email address.");
 }
 const currentStatus = await status(c, session.user.id);
 if (!currentStatus.canRequest) {
  await audit(c, session.user.id, "account.deletion_blocked", "denied");
  return apiError(c, 409, "ACCOUNT_DELETION_BLOCKED", "Transfer or delete households you own before requesting account deletion.");
 }
 await c.env.DB.prepare(`INSERT INTO account_deletion_requests(user_id,status,requested_at,earliest_delete_at,cancelled_at,completed_at,reason_code,updated_at)
 VALUES(?,'requested',datetime('now'),datetime('now','+24 hour'),NULL,NULL,NULL,datetime('now'))
 ON CONFLICT(user_id) DO UPDATE SET status='requested',requested_at=datetime('now'),earliest_delete_at=datetime('now','+24 hour'),cancelled_at=NULL,completed_at=NULL,reason_code=NULL,updated_at=datetime('now')`)
  .bind(session.user.id)
  .run();
 await audit(c, session.user.id, "account.deletion_requested", "success");
 return c.json(await status(c, session.user.id));
});

app.delete("/api/v1/security/account-deletion", async c => {
 const session = await current(c);
 if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
 const result = await c.env.DB.prepare("UPDATE account_deletion_requests SET status='cancelled',cancelled_at=datetime('now'),updated_at=datetime('now') WHERE user_id=? AND status='requested'")
  .bind(session.user.id)
  .run();
 if (!result.meta.changes) return apiError(c, 404, "NO_DELETION_REQUEST", "There is no active deletion request to cancel.");
 await audit(c, session.user.id, "account.deletion_cancelled", "success");
 return c.json(await status(c, session.user.id));
});

export default app;
