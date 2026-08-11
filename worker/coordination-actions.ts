import { Hono } from "hono";
import { createAuth } from "./auth";
import { recordHouseholdActivity } from "./activity";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Kind = "task" | "routine" | "meal";

async function sessionUser(c: Ctx) {
  return (await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers }))?.user ?? null;
}
async function membership(c: Ctx, householdId: string, userId: string) {
  return c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId, userId).first<{ role: string }>();
}
async function hasPermission(c: Ctx, householdId: string, userId: string, permissionKey: string) {
  const m = await membership(c, householdId, userId); if (!m) return false;
  const override = await c.env.DB.prepare("SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key=? LIMIT 1").bind(householdId, userId, permissionKey).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";
  const role = await c.env.DB.prepare("SELECT effect FROM role_permissions WHERE role_key=? AND permission_key=? LIMIT 1").bind(m.role, permissionKey).first<{ effect: "allow" | "deny" }>();
  return role?.effect === "allow";
}
async function targetMember(c: Ctx, householdId: string, userId: string) {
  return c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.user_id=? AND m.status='active'`).bind(householdId, userId).first<{ userId: string; name: string }>();
}

app.patch("/api/v1/households/:householdId/coordination/assign", async c => {
  const user = await sessionUser(c); if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to coordinate your household.");
  const householdId = c.req.param("householdId") ?? ""; if (!householdId) return apiError(c, 404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.");
  const actorMembership = await membership(c, householdId, user.id); if (!actorMembership) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  const body = await c.req.json().catch(() => null) as { kind?: unknown; id?: unknown; userId?: unknown } | null;
  const kind = body?.kind as Kind; const id = typeof body?.id === "string" ? body.id.trim() : ""; const assigneeUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!["task", "routine", "meal"].includes(kind) || !id || !assigneeUserId) return apiError(c, 422, "VALIDATION_FAILED", "Choose an item and an active household member.");
  const assignee = await targetMember(c, householdId, assigneeUserId); if (!assignee) return apiError(c, 422, "ASSIGNEE_NOT_MEMBER", "Choose an active household member.");

  if (kind === "task") {
    if (!(await hasPermission(c, householdId, user.id, "tasks.manage"))) return apiError(c, 403, "TASKS_MANAGE_REQUIRED", "You do not have permission to assign tasks.");
    const task = await c.env.DB.prepare("SELECT title FROM everyday_tasks WHERE id=? AND household_id=? AND status='todo'").bind(id, householdId).first<{ title: string }>();
    if (!task) return apiError(c, 404, "TASK_NOT_FOUND", "That task could not be found.");
    await c.env.DB.prepare("UPDATE everyday_tasks SET assignee_user_id=?,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(assigneeUserId, id, householdId).run();
    await recordHouseholdActivity(c, householdId, user.id, "task.assigned", `${user.name ?? "A household member"} assigned “${task.title}” to ${assignee.name}.`);
    return c.json({ ok: true, kind, id, assignee });
  }

  if (kind === "routine") {
    if (!["owner", "admin", "adult", "teen"].includes(actorMembership.role)) return apiError(c, 403, "ROUTINES_MANAGE_REQUIRED", "You do not have permission to assign routines.");
    const routine = await c.env.DB.prepare("SELECT title FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(id, householdId).first<{ title: string }>();
    if (!routine) return apiError(c, 404, "ROUTINE_NOT_FOUND", "That routine could not be found.");
    await c.env.DB.prepare("UPDATE household_routines SET assignee_user_id=?,rotation_mode='none',rotation_member_ids=NULL,rotation_index=0,last_notified_due_at=NULL,snoozed_until=NULL,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(assigneeUserId, id, householdId).run();
    await recordHouseholdActivity(c, householdId, user.id, "routine.assigned", `${user.name ?? "A household member"} assigned “${routine.title}” to ${assignee.name}.`);
    return c.json({ ok: true, kind, id, assignee });
  }

  if (!(await hasPermission(c, householdId, user.id, "meals.manage"))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to assign meals.");
  const meal = await c.env.DB.prepare("SELECT title FROM meal_plans WHERE id=? AND household_id=?").bind(id, householdId).first<{ title: string }>();
  if (!meal) return apiError(c, 404, "MEAL_NOT_FOUND", "That planned meal could not be found.");
  await c.env.DB.prepare("UPDATE meal_plans SET cook_user_id=?,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(assigneeUserId, id, householdId).run();
  await recordHouseholdActivity(c, householdId, user.id, "meal.assigned", `${user.name ?? "A household member"} assigned “${meal.title}” to ${assignee.name}.`);
  return c.json({ ok: true, kind, id, assignee });
});

export default app;
