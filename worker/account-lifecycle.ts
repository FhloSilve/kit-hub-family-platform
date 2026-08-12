import { Hono, type Context } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Context<AppBindings>;
const COOLING_OFF_HOURS = 48;
const REAUTH_WINDOW_MINUTES = 15;

type OwnedHousehold = { id: string; name: string };
type MembershipRow = { householdId: string; householdName: string; role: string };
type SuccessorRow = { userId: string; name: string; email: string; role: string };
type SessionResult = Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;

async function current(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  return session;
}

function sessionCreatedAt(session: NonNullable<SessionResult>) {
  const raw = session.session?.createdAt as Date | string | number | undefined;
  if (!raw) return 0;
  const value = raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function isRecentlyAuthenticated(session: NonNullable<SessionResult>) {
  const createdAt = sessionCreatedAt(session);
  return createdAt > 0 && Date.now() - createdAt <= REAUTH_WINDOW_MINUTES * 60_000;
}

async function requireRecentAuthentication(c: Ctx, session: NonNullable<SessionResult>, action: string) {
  if (isRecentlyAuthenticated(session)) return null;
  await audit(c, session.user.id, `${action}.reauth_required`, "denied");
  return apiError(c, 401, "REAUTH_REQUIRED", `For your protection, confirm your password again before this action. Recent authentication lasts ${REAUTH_WINDOW_MINUTES} minutes.`);
}

async function audit(c: Ctx, userId: string, action: string, result: "success" | "denied" | "failure", householdId: string | null = null) {
  await c.env.DB.prepare("INSERT INTO audit_events(id,household_id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))")
    .bind(crypto.randomUUID(), householdId, userId, action, "account_lifecycle", result, c.get("requestId") ?? null)
    .run()
    .catch(() => undefined);
}

async function status(c: Ctx, userId: string, recentAuth = false) {
  const [owned, memberships, pending] = await Promise.all([
    c.env.DB.prepare("SELECT h.id,h.name FROM memberships m JOIN households h ON h.id=m.household_id WHERE m.user_id=? AND m.status='active' AND m.role_key='owner' AND h.deleted_at IS NULL ORDER BY h.name")
      .bind(userId)
      .all<OwnedHousehold>(),
    c.env.DB.prepare("SELECT h.id householdId,h.name householdName,m.role_key role FROM memberships m JOIN households h ON h.id=m.household_id WHERE m.user_id=? AND m.status='active' AND h.deleted_at IS NULL ORDER BY h.name")
      .bind(userId)
      .all<MembershipRow>(),
    c.env.DB.prepare("SELECT status,requested_at requestedAt,earliest_delete_at earliestDeleteAt,cancelled_at cancelledAt,reason_code reasonCode FROM account_deletion_requests WHERE user_id=?")
      .bind(userId)
      .first<{ status: string; requestedAt: string; earliestDeleteAt: string; cancelledAt: string | null; reasonCode: string | null }>()
      .catch(() => null),
  ]);

  const ownedHouseholds = await Promise.all(owned.results.map(async household => {
    const candidates = await c.env.DB.prepare(
      `SELECT m.user_id userId,u.name,u.email,m.role_key role
       FROM memberships m JOIN "user" u ON u.id=m.user_id
       WHERE m.household_id=? AND m.status='active' AND m.user_id<>?
         AND m.role_key IN ('admin','adult')
       ORDER BY CASE m.role_key WHEN 'admin' THEN 0 ELSE 1 END,u.name COLLATE NOCASE`,
    ).bind(household.id, userId).all<SuccessorRow>();
    return { ...household, successors: candidates.results };
  }));

  const blockers = ownedHouseholds.map(row => ({
    code: "OWNS_HOUSEHOLD",
    householdId: row.id,
    label: row.successors.length
      ? `Transfer ownership of ${row.name} before deleting your account.`
      : `${row.name} needs another Adult or Admin before ownership can be transferred.`,
  }));

  const request = pending ?? null;
  const readyToFinalize = Boolean(
    request?.status === "requested" &&
    request.earliestDeleteAt &&
    Date.parse(request.earliestDeleteAt) <= Date.now() &&
    blockers.length === 0 &&
    memberships.results.length === 0,
  );

  return {
    canRequest: blockers.length === 0,
    blockers,
    ownedHouseholds,
    memberships: memberships.results,
    activeMemberships: memberships.results.length,
    request,
    coolingOffHours: COOLING_OFF_HOURS,
    readyToFinalize,
    requiresReauth: !recentAuth,
    reauthWindowMinutes: REAUTH_WINDOW_MINUTES,
    note: "Kit Hub uses a 48-hour cooling-off period. Household ownership must be transferred first, and you must leave remaining households before permanent account anonymization can finish.",
  };
}

app.get("/api/v1/security/account-deletion", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  return c.json(await status(c, session.user.id, isRecentlyAuthenticated(session)));
});

app.post("/api/v1/security/household-ownership/:householdId/transfer", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const reauth = await requireRecentAuthentication(c, session, "household.ownership_transfer");
  if (reauth) return reauth;
  const householdId = c.req.param("householdId");
  const body = await c.req.json().catch(() => null) as { targetUserId?: unknown } | null;
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
  if (!targetUserId || targetUserId === session.user.id) return apiError(c, 422, "OWNERSHIP_TARGET_REQUIRED", "Choose another Adult or Admin in this household.");

  const owner = await c.env.DB.prepare("SELECT 1 ok FROM memberships WHERE household_id=? AND user_id=? AND status='active' AND role_key='owner'")
    .bind(householdId, session.user.id).first();
  if (!owner) {
    await audit(c, session.user.id, "household.ownership_transfer_denied", "denied", householdId);
    return apiError(c, 403, "HOUSEHOLD_OWNER_REQUIRED", "Only the current household owner can transfer ownership.");
  }
  const target = await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active' AND role_key IN ('admin','adult')")
    .bind(householdId, targetUserId).first<{ role: string }>();
  if (!target) return apiError(c, 422, "OWNERSHIP_TARGET_INVALID", "Ownership can only be transferred to an active Adult or Admin.");

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE memberships SET role_key='admin',updated_at=datetime('now') WHERE household_id=? AND user_id=? AND role_key='owner'").bind(householdId, session.user.id),
    c.env.DB.prepare("UPDATE memberships SET role_key='owner',updated_at=datetime('now') WHERE household_id=? AND user_id=? AND status='active'").bind(householdId, targetUserId),
  ]);
  await audit(c, session.user.id, "household.ownership_transferred", "success", householdId);
  return c.json(await status(c, session.user.id, true));
});

app.post("/api/v1/security/households/:householdId/leave", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const reauth = await requireRecentAuthentication(c, session, "household.leave");
  if (reauth) return reauth;
  const householdId = c.req.param("householdId");
  const membership = await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'")
    .bind(householdId, session.user.id).first<{ role: string }>();
  if (!membership) return apiError(c, 404, "MEMBERSHIP_NOT_FOUND", "You are not an active member of that household.");
  if (membership.role === "owner") return apiError(c, 409, "TRANSFER_OWNERSHIP_FIRST", "Transfer household ownership before leaving.");
  await c.env.DB.prepare("UPDATE memberships SET status='left',updated_at=datetime('now') WHERE household_id=? AND user_id=? AND status='active'")
    .bind(householdId, session.user.id).run();
  await audit(c, session.user.id, "household.left_for_account_deletion", "success", householdId);
  return c.json(await status(c, session.user.id, true));
});

app.post("/api/v1/security/account-deletion", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const reauth = await requireRecentAuthentication(c, session, "account.deletion_request");
  if (reauth) return reauth;
  const body = await c.req.json().catch(() => null) as { confirmation?: unknown; email?: unknown } | null;
  if (body?.confirmation !== "DELETE MY ACCOUNT" || String(body?.email ?? "").toLowerCase() !== String(session.user.email).toLowerCase()) {
    return apiError(c, 422, "DELETION_CONFIRMATION_REQUIRED", "Type DELETE MY ACCOUNT and confirm your signed-in email address.");
  }
  const currentStatus = await status(c, session.user.id, true);
  if (!currentStatus.canRequest) {
    await audit(c, session.user.id, "account.deletion_blocked", "denied");
    return apiError(c, 409, "ACCOUNT_DELETION_BLOCKED", "Transfer households you own before requesting account deletion.");
  }
  await c.env.DB.prepare(`INSERT INTO account_deletion_requests(user_id,status,requested_at,earliest_delete_at,cancelled_at,completed_at,reason_code,updated_at)
 VALUES(?,'requested',datetime('now'),datetime('now','+48 hour'),NULL,NULL,NULL,datetime('now'))
 ON CONFLICT(user_id) DO UPDATE SET status='requested',requested_at=datetime('now'),earliest_delete_at=datetime('now','+48 hour'),cancelled_at=NULL,completed_at=NULL,reason_code=NULL,updated_at=datetime('now')`)
    .bind(session.user.id)
    .run();
  await audit(c, session.user.id, "account.deletion_requested", "success");
  return c.json(await status(c, session.user.id, true));
});

app.delete("/api/v1/security/account-deletion", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const result = await c.env.DB.prepare("UPDATE account_deletion_requests SET status='cancelled',cancelled_at=datetime('now'),updated_at=datetime('now') WHERE user_id=? AND status='requested'")
    .bind(session.user.id)
    .run();
  if (!result.meta.changes) return apiError(c, 404, "NO_DELETION_REQUEST", "There is no active deletion request to cancel.");
  await audit(c, session.user.id, "account.deletion_cancelled", "success");
  return c.json(await status(c, session.user.id, isRecentlyAuthenticated(session)));
});

app.post("/api/v1/security/account-deletion/finalize", async c => {
  const session = await current(c);
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const reauth = await requireRecentAuthentication(c, session, "account.deletion_finalize");
  if (reauth) return reauth;
  const body = await c.req.json().catch(() => null) as { confirmation?: unknown; email?: unknown } | null;
  if (body?.confirmation !== "ERASE MY ACCOUNT" || String(body?.email ?? "").toLowerCase() !== String(session.user.email).toLowerCase()) {
    return apiError(c, 422, "FINAL_DELETION_CONFIRMATION_REQUIRED", "Type ERASE MY ACCOUNT and confirm your signed-in email address.");
  }
  const currentStatus = await status(c, session.user.id, true);
  if (!currentStatus.request || currentStatus.request.status !== "requested") return apiError(c, 409, "DELETION_NOT_REQUESTED", "Request account deletion first.");
  if (Date.parse(currentStatus.request.earliestDeleteAt) > Date.now()) return apiError(c, 409, "COOLING_OFF_ACTIVE", "The 48-hour cooling-off period has not finished yet.");
  if (currentStatus.activeMemberships > 0 || currentStatus.blockers.length > 0) return apiError(c, 409, "MEMBERSHIPS_REMAIN", "Leave all households before permanent deletion can finish.");

  const originalEmail = String(session.user.email).toLowerCase();
  const tombstoneEmail = `deleted+${crypto.randomUUID()}@kit-hub.invalid`;
  const nowMs = Date.now();
  await audit(c, session.user.id, "account.deletion_finalized", "success");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM \"session\" WHERE \"userId\"=?").bind(session.user.id),
    c.env.DB.prepare("DELETE FROM \"account\" WHERE \"userId\"=?").bind(session.user.id),
    c.env.DB.prepare("DELETE FROM verification WHERE lower(identifier)=lower(?)").bind(originalEmail),
    c.env.DB.prepare("DELETE FROM profiles WHERE user_id=?").bind(session.user.id),
    c.env.DB.prepare("UPDATE \"user\" SET name='Deleted member',email=?,image=NULL,emailVerified=0,updatedAt=? WHERE id=?").bind(tombstoneEmail, nowMs, session.user.id),
    c.env.DB.prepare("UPDATE account_deletion_requests SET status='completed',completed_at=datetime('now'),updated_at=datetime('now') WHERE user_id=?").bind(session.user.id),
  ]);
  return c.json({ completed: true, message: "Your Kit Hub sign-in identity has been removed. Shared household records keep only a non-identifying Deleted member reference where needed for household history." });
});

export default app;
