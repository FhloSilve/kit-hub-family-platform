import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";
import type { EventRecurrence, EventType, HouseholdRole } from "../shared/contracts";

const app = new Hono<AppBindings>();

async function getSessionUser(c: Parameters<typeof apiError>[0]) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

async function hasPermission(c: Parameters<typeof apiError>[0], householdId: string, userId: string, permissionKey: string) {
  const membership = await c.env.DB.prepare(
    "SELECT role_key AS roleKey FROM memberships WHERE household_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
  ).bind(householdId, userId).first<{ roleKey: HouseholdRole }>();
  if (!membership) return false;
  const override = await c.env.DB.prepare(
    "SELECT effect FROM member_permission_overrides WHERE household_id = ? AND user_id = ? AND permission_key = ? LIMIT 1",
  ).bind(householdId, userId, permissionKey).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";
  const permission = await c.env.DB.prepare(
    "SELECT effect FROM role_permissions WHERE role_key = ? AND permission_key = ? LIMIT 1",
  ).bind(membership.roleKey, permissionKey).first<{ effect: "allow" | "deny" }>();
  return permission?.effect === "allow";
}

app.get("/api/v1/households/:householdId/everyday", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to open your household.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "household.view"))) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");

  const [members, tasks, groceries, events] = await Promise.all([
    c.env.DB.prepare(`SELECT m.id, m.user_id AS userId, u.name, u.email, m.role_key AS role, m.joined_at AS joinedAt
      FROM memberships m INNER JOIN "user" u ON u.id = m.user_id
      WHERE m.household_id = ? AND m.status = 'active'
      ORDER BY CASE m.role_key WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name COLLATE NOCASE`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at AS dueAt,
      t.assignee_user_id AS assigneeUserId, u.name AS assigneeName, t.created_at AS createdAt
      FROM everyday_tasks t LEFT JOIN "user" u ON u.id = t.assignee_user_id
      WHERE t.household_id = ?
      ORDER BY CASE t.status WHEN 'todo' THEN 0 ELSE 1 END,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.created_at DESC`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT id, name, quantity, checked, important, created_at AS createdAt
      FROM everyday_grocery_items WHERE household_id = ?
      ORDER BY checked ASC, important DESC, created_at DESC`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT id, title, description, location, starts_at AS startsAt, ends_at AS endsAt,
      all_day AS allDay, event_type AS eventType, recurrence, reminder_minutes AS reminderMinutes, created_at AS createdAt
      FROM everyday_events WHERE household_id = ? ORDER BY starts_at ASC`).bind(householdId).all(),
  ]);

  return c.json({
    members: members.results,
    tasks: tasks.results,
    groceries: groceries.results.map((item: Record<string, unknown>) => ({ ...item, checked: Boolean(item.checked), important: Boolean(item.important) })),
    events: events.results.map((event: Record<string, unknown>) => ({ ...event, allDay: Boolean(event.allDay) })),
  });
});

app.post("/api/v1/households/:householdId/groceries", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add groceries.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "groceries.manage"))) return apiError(c, 403, "GROCERIES_MANAGE_REQUIRED", "You do not have permission to manage groceries.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) return apiError(c, 422, "VALIDATION_FAILED", "Grocery item must be between 1 and 120 characters.");
  const quantity = typeof input?.quantity === "string" ? input.quantity.trim().slice(0, 40) || "1" : "1";
  const important = input?.important === true;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO everyday_grocery_items (id, household_id, name, quantity, important, added_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, householdId, name, quantity, important ? 1 : 0, user.id).run();
  const created = await c.env.DB.prepare("SELECT id, name, quantity, checked, important, created_at AS createdAt FROM everyday_grocery_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json({ ...created, checked: Boolean(created?.checked), important: Boolean(created?.important) }, 201);
});

app.patch("/api/v1/households/:householdId/groceries/:itemId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update groceries.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "groceries.manage"))) return apiError(c, 403, "GROCERIES_MANAGE_REQUIRED", "You do not have permission to manage groceries.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const updates: string[] = [];
  const values: Array<string | number> = [];
  if (typeof input?.checked === "boolean") { updates.push("checked = ?"); values.push(input.checked ? 1 : 0); }
  if (typeof input?.important === "boolean") { updates.push("important = ?"); values.push(input.important ? 1 : 0); }
  if (!updates.length) return apiError(c, 422, "VALIDATION_FAILED", "No grocery changes were supplied.");
  updates.push("updated_at = datetime('now')");
  values.push(c.req.param("itemId"), householdId);
  const result = await c.env.DB.prepare(`UPDATE everyday_grocery_items SET ${updates.join(", ")} WHERE id = ? AND household_id = ?`).bind(...values).run();
  if (!result.meta.changes) return apiError(c, 404, "GROCERY_NOT_FOUND", "That grocery item could not be found.");
  const updated = await c.env.DB.prepare("SELECT id, name, quantity, checked, important, created_at AS createdAt FROM everyday_grocery_items WHERE id = ?").bind(c.req.param("itemId")).first<Record<string, unknown>>();
  return c.json({ ...updated, checked: Boolean(updated?.checked), important: Boolean(updated?.important) });
});

app.post("/api/v1/households/:householdId/events", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add an event.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "calendar.manage"))) return apiError(c, 403, "CALENDAR_MANAGE_REQUIRED", "You do not have permission to manage the calendar.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const startsAt = typeof input?.startsAt === "string" ? input.startsAt : "";
  if (!title || title.length > 160) return apiError(c, 422, "VALIDATION_FAILED", "Event title must be between 1 and 160 characters.");
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return apiError(c, 422, "VALIDATION_FAILED", "Event start date is not valid.");
  const endsAt = typeof input?.endsAt === "string" && input.endsAt ? input.endsAt : null;
  if (endsAt && (Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) < Date.parse(startsAt))) return apiError(c, 422, "VALIDATION_FAILED", "Event end must be after its start.");
  const eventTypes: EventType[] = ["event", "birthday", "happening", "appointment", "school", "pet", "meal", "holiday"];
  const recurrences: EventRecurrence[] = ["none", "daily", "weekly", "monthly", "yearly"];
  const eventType = eventTypes.includes(input?.eventType as EventType) ? input?.eventType as EventType : "event";
  const recurrence = recurrences.includes(input?.recurrence as EventRecurrence) ? input?.recurrence as EventRecurrence : "none";
  const reminderMinutes = typeof input?.reminderMinutes === "number" && Number.isInteger(input.reminderMinutes) && input.reminderMinutes >= 0 && input.reminderMinutes <= 10080 ? input.reminderMinutes : null;
  const description = typeof input?.description === "string" ? input.description.trim().slice(0, 2000) || null : null;
  const location = typeof input?.location === "string" ? input.location.trim().slice(0, 180) || null : null;
  const allDay = input?.allDay === true;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO everyday_events
    (id, household_id, title, description, location, starts_at, ends_at, all_day, event_type, recurrence, reminder_minutes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, householdId, title, description, location, startsAt, endsAt, allDay ? 1 : 0, eventType, recurrence, reminderMinutes, user.id,
    ).run();
  const created = await c.env.DB.prepare(`SELECT id, title, description, location, starts_at AS startsAt, ends_at AS endsAt,
    all_day AS allDay, event_type AS eventType, recurrence, reminder_minutes AS reminderMinutes, created_at AS createdAt
    FROM everyday_events WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return c.json({ ...created, allDay: Boolean(created?.allDay) }, 201);
});

export default app;
