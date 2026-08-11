import { Hono } from "hono";
import { createAuth } from "./auth";
import { recordHouseholdActivity } from "./activity";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type ActionType = "task.create" | "task.update" | "task.complete" | "event.create" | "event.update" | "meal.plan" | "meal.move" | "routine.create" | "routine.assign" | "routine.complete";
type ProposedAction = { type: ActionType; summary: string; payload: Record<string, unknown> };
type Authorized = { user: { id: string; name?: string | null }; householdId: string; role: string };
type AccessResult = { ok: true; value: Authorized } | { ok: false; response: ReturnType<typeof apiError> };

async function access(c: Ctx): Promise<AccessResult> {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { ok: false, response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to ask Silvi about your household.") };
  const householdId = c.req.param("householdId") ?? "";
  if (!householdId) return { ok: false, response: apiError(c, 404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.") };
  const membership = await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'")
    .bind(householdId, session.user.id).first<{ role: string }>();
  if (!membership) return { ok: false, response: apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.") };
  return { ok: true, value: { user: session.user, householdId, role: membership.role } };
}

function isoNow() { return new Date().toISOString(); }
function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function optionalText(value: unknown, max: number) { const text = clean(value, max); return text || null; }
function validIso(value: unknown) { if (typeof value !== "string" || !value) return null; const time = Date.parse(value); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
function owns(object: Record<string, unknown>, key: string) { return Object.prototype.hasOwnProperty.call(object, key); }
function routineManager(role: string) { return ["owner", "admin", "adult", "teen"].includes(role); }
function nextDue(current: string | null, cadence: string) { const d = current ? new Date(current) : new Date(); if (Number.isNaN(d.getTime())) return null; if (cadence === "daily") d.setDate(d.getDate() + 1); else if (cadence === "monthly") d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 7); return d.toISOString(); }
function niceDate(value: string) { return new Date(value).toLocaleString(); }

async function hasPermission(c: Ctx, householdId: string, userId: string, permissionKey: string) {
  const membership = await c.env.DB.prepare("SELECT role_key roleKey FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1")
    .bind(householdId, userId).first<{ roleKey: string }>();
  if (!membership) return false;
  const override = await c.env.DB.prepare("SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key=? LIMIT 1")
    .bind(householdId, userId, permissionKey).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";
  const permission = await c.env.DB.prepare("SELECT effect FROM role_permissions WHERE role_key=? AND permission_key=? LIMIT 1")
    .bind(membership.roleKey, permissionKey).first<{ effect: "allow" | "deny" }>();
  return permission?.effect === "allow";
}

async function member(c: Ctx, householdId: string, userId: string) {
  return c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.user_id=? AND m.status='active'`)
    .bind(householdId, userId).first<{ userId: string; name: string }>();
}

async function householdContext(c: Ctx, a: Authorized) {
  const now = isoNow();
  const today = now.slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();
  const [household, locale, members, tasks, events, meals, routines, activity, taskManage, calendarManage, mealsManage] = await Promise.all([
    c.env.DB.prepare("SELECT name,default_language defaultLanguage,timezone FROM households WHERE id=?").bind(a.householdId).first(),
    c.env.DB.prepare("SELECT language,region,time_zone timeZone FROM user_locale_preferences WHERE user_id=?").bind(a.user.id).first(),
    c.env.DB.prepare(`SELECT m.user_id userId,u.name,m.role_key role FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(a.householdId).all(),
    c.env.DB.prepare(`SELECT t.id,t.title,t.notes,t.priority,t.due_at dueAt,t.status,t.assignee_user_id assigneeUserId,u.name assigneeName FROM everyday_tasks t LEFT JOIN "user" u ON u.id=t.assignee_user_id WHERE t.household_id=? AND t.status='todo' ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at LIMIT 30`).bind(a.householdId).all(),
    c.env.DB.prepare(`SELECT id,title,description,location,starts_at startsAt,ends_at endsAt,all_day allDay,event_type eventType,recurrence,reminder_minutes reminderMinutes FROM everyday_events WHERE household_id=? AND starts_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 30`).bind(a.householdId, now, weekEnd).all(),
    c.env.DB.prepare(`SELECT p.id,p.meal_date mealDate,p.meal_type mealType,p.title,p.cook_user_id cookUserId,u.name cookName,p.notes,p.reminder_minutes reminderMinutes FROM meal_plans p LEFT JOIN "user" u ON u.id=p.cook_user_id WHERE p.household_id=? AND p.meal_date>=? AND p.meal_date<=date(?, '+7 day') ORDER BY p.meal_date,CASE p.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END LIMIT 40`).bind(a.householdId, today, today).all(),
    c.env.DB.prepare(`SELECT r.id,r.title,r.notes,r.cadence,r.next_due_at nextDueAt,r.reminder_minutes reminderMinutes,r.assignee_user_id assigneeUserId,u.name assigneeName,CASE WHEN r.next_due_at IS NOT NULL AND r.next_due_at<? THEN 1 ELSE 0 END overdue FROM household_routines r LEFT JOIN "user" u ON u.id=r.assignee_user_id WHERE r.household_id=? AND r.active=1 ORDER BY CASE WHEN r.next_due_at IS NULL THEN 1 ELSE 0 END,r.next_due_at LIMIT 30`).bind(now, a.householdId).all(),
    c.env.DB.prepare(`SELECT kind,summary,created_at createdAt FROM household_activity WHERE household_id=? ORDER BY created_at DESC LIMIT 15`).bind(a.householdId).all().catch(() => ({ results: [] } as any)),
    hasPermission(c, a.householdId, a.user.id, "tasks.manage"),
    hasPermission(c, a.householdId, a.user.id, "calendar.manage"),
    hasPermission(c, a.householdId, a.user.id, "meals.manage"),
  ]);
  const mineTasks = (tasks.results as any[]).filter(x => x.assigneeUserId === a.user.id);
  const mineRoutines = (routines.results as any[]).filter(x => x.assigneeUserId === a.user.id);
  return {
    household, locale: locale ?? null, currentTime: now, currentUserId: a.user.id, members: members.results,
    capabilities: { tasks: taskManage, calendar: calendarManage, meals: mealsManage, routines: routineManager(a.role) },
    summary: { openTasks: tasks.results.length, myOpenTasks: mineTasks.length, upcomingEvents: events.results.length, plannedMeals: meals.results.length, activeRoutines: routines.results.length, myRoutines: mineRoutines.length, overdueRoutines: (routines.results as any[]).filter(x => Boolean(x.overdue)).length },
    tasks: tasks.results, upcomingEvents: events.results, meals: meals.results, routines: routines.results, recentActivity: (activity as any).results ?? [],
  };
}

function parseEnvelope(raw: string): { answer: string; action?: { type?: unknown; payload?: unknown } | null } {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = stripped.indexOf("{"); const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { const parsed = JSON.parse(stripped.slice(first, last + 1)) as any; return { answer: clean(parsed?.answer, 4000) || "I can help with that.", action: parsed?.action ?? null }; }
    catch { /* use raw answer below */ }
  }
  return { answer: clean(raw, 4000) || "Silvi could not form an answer yet.", action: null };
}

async function normalizeAction(c: Ctx, a: Authorized, raw: { type?: unknown; payload?: unknown } | null | undefined): Promise<ProposedAction | null> {
  if (!raw || typeof raw.type !== "string" || !raw.payload || typeof raw.payload !== "object") return null;
  const payload = raw.payload as Record<string, unknown>;
  const type = raw.type as ActionType;
  const supported: ActionType[] = ["task.create", "task.update", "task.complete", "event.create", "event.update", "meal.plan", "meal.move", "routine.create", "routine.assign", "routine.complete"];
  if (!supported.includes(type)) return null;

  if (type === "task.create") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "tasks.manage"))) return null;
    const title = clean(payload.title, 160); if (!title) return null;
    const priority = payload.priority === "low" || payload.priority === "high" ? payload.priority : "normal";
    const dueAt = payload.dueAt == null ? null : validIso(payload.dueAt); if (payload.dueAt && !dueAt) return null;
    const assigneeUserId = clean(payload.assigneeUserId, 120) || null;
    const assignee = assigneeUserId ? await member(c, a.householdId, assigneeUserId) : null; if (assigneeUserId && !assignee) return null;
    return { type, payload: { title, notes: optionalText(payload.notes, 2000), priority, dueAt, assigneeUserId }, summary: `Create task “${title}”${assignee ? ` for ${assignee.name}` : ""}${dueAt ? ` due ${niceDate(dueAt)}` : ""}.` };
  }

  if (type === "task.update") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "tasks.manage"))) return null;
    const taskId = clean(payload.taskId, 120); if (!taskId) return null;
    const task = await c.env.DB.prepare("SELECT id,title FROM everyday_tasks WHERE id=? AND household_id=? AND status='todo'").bind(taskId, a.householdId).first<{ id: string; title: string }>(); if (!task) return null;
    const changes: Record<string, unknown> = { taskId }; const labels: string[] = [];
    if (owns(payload, "title")) { const title = clean(payload.title, 160); if (!title) return null; changes.title = title; labels.push(`title → “${title}”`); }
    if (owns(payload, "priority")) { if (!["low", "normal", "high"].includes(String(payload.priority))) return null; changes.priority = String(payload.priority); labels.push(`priority → ${changes.priority}`); }
    if (owns(payload, "notes")) { changes.notes = payload.notes == null ? null : optionalText(payload.notes, 2000); labels.push(changes.notes ? "update notes" : "clear notes"); }
    if (owns(payload, "dueAt")) { const dueAt = payload.dueAt == null ? null : validIso(payload.dueAt); if (payload.dueAt && !dueAt) return null; changes.dueAt = dueAt; labels.push(dueAt ? `due → ${niceDate(dueAt)}` : "clear due date"); }
    if (owns(payload, "assigneeUserId")) { const id = clean(payload.assigneeUserId, 120) || null; const assigned = id ? await member(c, a.householdId, id) : null; if (id && !assigned) return null; changes.assigneeUserId = id; labels.push(assigned ? `assign → ${assigned.name}` : "make unassigned"); }
    if (!labels.length) return null;
    return { type, payload: changes, summary: `Update task “${task.title}”: ${labels.join(", ")}.` };
  }

  if (type === "task.complete") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "tasks.manage"))) return null;
    const taskId = clean(payload.taskId, 120); if (!taskId) return null;
    const task = await c.env.DB.prepare("SELECT id,title FROM everyday_tasks WHERE id=? AND household_id=? AND status='todo'").bind(taskId, a.householdId).first<{ id: string; title: string }>();
    return task ? { type, payload: { taskId }, summary: `Mark task “${task.title}” as done.` } : null;
  }

  if (type === "event.create") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "calendar.manage"))) return null;
    const title = clean(payload.title, 160), startsAt = validIso(payload.startsAt); if (!title || !startsAt) return null;
    const endsAt = payload.endsAt == null ? null : validIso(payload.endsAt); if (payload.endsAt && !endsAt) return null;
    const eventTypes = ["event", "birthday", "happening", "appointment", "school", "pet", "meal", "holiday"];
    const recurrences = ["none", "daily", "weekly", "monthly", "yearly"];
    const eventType = eventTypes.includes(String(payload.eventType)) ? String(payload.eventType) : "event";
    const recurrence = recurrences.includes(String(payload.recurrence)) ? String(payload.recurrence) : "none";
    const reminderMinutes = typeof payload.reminderMinutes === "number" ? Math.max(0, Math.min(10080, payload.reminderMinutes)) : null;
    const normalized = { title, description: optionalText(payload.description, 2000), location: optionalText(payload.location, 180), startsAt, endsAt, allDay: payload.allDay === true, eventType, recurrence, reminderMinutes };
    return { type, payload: normalized, summary: `Add “${title}” to Calendar on ${niceDate(startsAt)}.` };
  }

  if (type === "event.update") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "calendar.manage"))) return null;
    const eventId = clean(payload.eventId, 120); if (!eventId) return null;
    const event = await c.env.DB.prepare("SELECT id,title FROM everyday_events WHERE id=? AND household_id=?").bind(eventId, a.householdId).first<{ id: string; title: string }>(); if (!event) return null;
    const changes: Record<string, unknown> = { eventId }; const labels: string[] = [];
    if (owns(payload, "title")) { const title = clean(payload.title, 160); if (!title) return null; changes.title = title; labels.push(`title → “${title}”`); }
    if (owns(payload, "description")) { changes.description = payload.description == null ? null : optionalText(payload.description, 2000); labels.push(changes.description ? "update description" : "clear description"); }
    if (owns(payload, "location")) { changes.location = payload.location == null ? null : optionalText(payload.location, 180); labels.push(changes.location ? `location → ${changes.location}` : "clear location"); }
    if (owns(payload, "startsAt")) { const value = validIso(payload.startsAt); if (!value) return null; changes.startsAt = value; labels.push(`start → ${niceDate(value)}`); }
    if (owns(payload, "endsAt")) { const value = payload.endsAt == null ? null : validIso(payload.endsAt); if (payload.endsAt && !value) return null; changes.endsAt = value; labels.push(value ? `end → ${niceDate(value)}` : "clear end"); }
    if (owns(payload, "allDay")) { if (typeof payload.allDay !== "boolean") return null; changes.allDay = payload.allDay; labels.push(payload.allDay ? "make all-day" : "use specific times"); }
    if (owns(payload, "recurrence")) { if (!["none", "daily", "weekly", "monthly", "yearly"].includes(String(payload.recurrence))) return null; changes.recurrence = String(payload.recurrence); labels.push(`repeat → ${changes.recurrence}`); }
    if (owns(payload, "reminderMinutes")) { if (payload.reminderMinutes !== null && typeof payload.reminderMinutes !== "number") return null; changes.reminderMinutes = payload.reminderMinutes == null ? null : Math.max(0, Math.min(10080, Number(payload.reminderMinutes))); labels.push(changes.reminderMinutes == null ? "remove reminder" : `reminder → ${changes.reminderMinutes} min`); }
    if (!labels.length) return null;
    return { type, payload: changes, summary: `Update Calendar item “${event.title}”: ${labels.join(", ")}.` };
  }

  if (type === "meal.plan") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "meals.manage"))) return null;
    const mealDate = clean(payload.mealDate, 10), title = clean(payload.title, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate) || !title) return null;
    const mealType = ["breakfast", "lunch", "dinner", "snack"].includes(String(payload.mealType)) ? String(payload.mealType) : "dinner";
    const cookUserId = clean(payload.cookUserId, 120) || null; const cook = cookUserId ? await member(c, a.householdId, cookUserId) : null; if (cookUserId && !cook) return null;
    const reminderMinutes = typeof payload.reminderMinutes === "number" ? Math.max(0, Math.min(10080, payload.reminderMinutes)) : null;
    const existing = await c.env.DB.prepare("SELECT title FROM meal_plans WHERE household_id=? AND meal_date=? AND meal_type=?").bind(a.householdId, mealDate, mealType).first<{ title: string }>();
    const summary = existing ? `Replace ${mealType} “${existing.title}” with “${title}” on ${mealDate}${cook ? `, with ${cook.name} cooking` : ""}.` : `Plan ${title} for ${mealType} on ${mealDate}${cook ? ` with ${cook.name} cooking` : ""}.`;
    return { type, payload: { mealDate, mealType, title, cookUserId, notes: optionalText(payload.notes, 500), reminderMinutes }, summary };
  }

  if (type === "meal.move") {
    if (!(await hasPermission(c, a.householdId, a.user.id, "meals.manage"))) return null;
    const planId = clean(payload.planId, 120), mealDate = clean(payload.mealDate, 10); if (!planId || !/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return null;
    const mealType = ["breakfast", "lunch", "dinner", "snack"].includes(String(payload.mealType)) ? String(payload.mealType) : "dinner";
    const plan = await c.env.DB.prepare("SELECT id,title,meal_date mealDate,meal_type mealType FROM meal_plans WHERE id=? AND household_id=?").bind(planId, a.householdId).first<{ id: string; title: string; mealDate: string; mealType: string }>(); if (!plan) return null;
    const conflict = await c.env.DB.prepare("SELECT id,title FROM meal_plans WHERE household_id=? AND meal_date=? AND meal_type=? AND id<>?").bind(a.householdId, mealDate, mealType, planId).first(); if (conflict) return null;
    return { type, payload: { planId, mealDate, mealType }, summary: `Move ${plan.mealType} “${plan.title}” from ${plan.mealDate} to ${mealType} on ${mealDate}.` };
  }

  if (type === "routine.create") {
    if (!routineManager(a.role)) return null;
    const title = clean(payload.title, 160); if (!title) return null;
    const cadence = ["daily", "weekly", "monthly"].includes(String(payload.cadence)) ? String(payload.cadence) : "weekly";
    const assigneeUserId = clean(payload.assigneeUserId, 120) || null; const assignee = assigneeUserId ? await member(c, a.householdId, assigneeUserId) : null; if (assigneeUserId && !assignee) return null;
    const nextDueAt = payload.nextDueAt == null ? null : validIso(payload.nextDueAt); if (payload.nextDueAt && !nextDueAt) return null;
    const reminderMinutes = typeof payload.reminderMinutes === "number" ? Math.max(0, Math.min(10080, payload.reminderMinutes)) : null;
    return { type, payload: { title, notes: optionalText(payload.notes, 1200), cadence, assigneeUserId, nextDueAt, reminderMinutes }, summary: `Create ${cadence} routine “${title}”${assignee ? ` for ${assignee.name}` : ""}.` };
  }

  if (type === "routine.assign") {
    if (!routineManager(a.role)) return null;
    const routineId = clean(payload.routineId, 120); if (!routineId) return null;
    const routine = await c.env.DB.prepare("SELECT id,title FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(routineId, a.householdId).first<{ id: string; title: string }>(); if (!routine) return null;
    const assigneeUserId = clean(payload.assigneeUserId, 120) || null; const assignee = assigneeUserId ? await member(c, a.householdId, assigneeUserId) : null; if (assigneeUserId && !assignee) return null;
    return { type, payload: { routineId, assigneeUserId }, summary: assignee ? `Assign routine “${routine.title}” to ${assignee.name}.` : `Make routine “${routine.title}” unassigned.` };
  }

  if (type === "routine.complete") {
    const routineId = clean(payload.routineId, 120); if (!routineId) return null;
    const routine = await c.env.DB.prepare("SELECT id,title,assignee_user_id assigneeUserId FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(routineId, a.householdId).first<{ id: string; title: string; assigneeUserId: string | null }>();
    if (!routine || (routine.assigneeUserId && routine.assigneeUserId !== a.user.id && !routineManager(a.role))) return null;
    return { type, payload: { routineId }, summary: `Mark routine “${routine.title}” as done.` };
  }
  return null;
}

async function executeAction(c: Ctx, a: Authorized, action: ProposedAction) {
  const p = action.payload as any; const actor = a.user.name ?? "A household member";
  if (action.type === "task.create") {
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO everyday_tasks (id,household_id,title,notes,priority,due_at,assignee_user_id,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(id, a.householdId, p.title, p.notes, p.priority, p.dueAt, p.assigneeUserId, a.user.id).run();
    await recordHouseholdActivity(c, a.householdId, a.user.id, "task.add", `${actor} asked Silvi to add task “${p.title}”.`); return `Created task “${p.title}”.`;
  }
  if (action.type === "task.update") {
    const fields: string[] = [], values: Array<string | number | null> = [];
    for (const [key, column] of [["title", "title"], ["notes", "notes"], ["priority", "priority"], ["dueAt", "due_at"], ["assigneeUserId", "assignee_user_id"]] as const) if (owns(p, key)) { fields.push(`${column}=?`); values.push(p[key] as string | null); }
    if (!fields.length) throw new Error("There are no task changes left to apply.");
    values.push(p.taskId, a.householdId); const result = await c.env.DB.prepare(`UPDATE everyday_tasks SET ${fields.join(",")},updated_at=datetime('now') WHERE id=? AND household_id=? AND status='todo'`).bind(...values).run(); if (!result.meta.changes) throw new Error("That task is no longer open.");
    await recordHouseholdActivity(c, a.householdId, a.user.id, "task.updated", `${actor} updated a task with Silvi.`); return "Updated the task.";
  }
  if (action.type === "task.complete") {
    const task = await c.env.DB.prepare("SELECT title FROM everyday_tasks WHERE id=? AND household_id=? AND status='todo'").bind(p.taskId, a.householdId).first<{ title: string }>(); if (!task) throw new Error("That task is no longer open.");
    await c.env.DB.prepare("UPDATE everyday_tasks SET status='done',updated_at=datetime('now') WHERE id=? AND household_id=? AND status='todo'").bind(p.taskId, a.householdId).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "task.completed", `${actor} completed “${task.title}” with Silvi.`); return `Marked “${task.title}” as done.`;
  }
  if (action.type === "event.create") {
    const id = crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO everyday_events (id,household_id,title,description,location,starts_at,ends_at,all_day,event_type,recurrence,reminder_minutes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, a.householdId, p.title, p.description, p.location, p.startsAt, p.endsAt, p.allDay ? 1 : 0, p.eventType, p.recurrence, p.reminderMinutes, a.user.id).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "calendar.add", `${actor} asked Silvi to add “${p.title}” to Calendar.`); return `Added “${p.title}” to Calendar.`;
  }
  if (action.type === "event.update") {
    const fields: string[] = [], values: Array<string | number | null> = [];
    const mapping = [["title", "title"], ["description", "description"], ["location", "location"], ["startsAt", "starts_at"], ["endsAt", "ends_at"], ["recurrence", "recurrence"], ["reminderMinutes", "reminder_minutes"]] as const;
    for (const [key, column] of mapping) if (owns(p, key)) { fields.push(`${column}=?`); values.push(p[key] as string | number | null); }
    if (owns(p, "allDay")) { fields.push("all_day=?"); values.push(p.allDay ? 1 : 0); }
    if (!fields.length) throw new Error("There are no Calendar changes left to apply."); values.push(p.eventId, a.householdId);
    const result = await c.env.DB.prepare(`UPDATE everyday_events SET ${fields.join(",")},updated_at=datetime('now') WHERE id=? AND household_id=?`).bind(...values).run(); if (!result.meta.changes) throw new Error("That Calendar item could not be found."); await recordHouseholdActivity(c, a.householdId, a.user.id, "calendar.updated", `${actor} updated a Calendar item with Silvi.`); return "Updated the Calendar item.";
  }
  if (action.type === "meal.plan") {
    const id = crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO meal_plans (id,household_id,meal_date,meal_type,title,recipe_id,cook_user_id,notes,reminder_minutes,created_by) VALUES (?,?,?,?,?,NULL,?,?,?,?) ON CONFLICT(household_id,meal_date,meal_type) DO UPDATE SET title=excluded.title,recipe_id=NULL,cook_user_id=excluded.cook_user_id,notes=excluded.notes,reminder_minutes=excluded.reminder_minutes,updated_at=datetime('now')`).bind(id, a.householdId, p.mealDate, p.mealType, p.title, p.cookUserId, p.notes, p.reminderMinutes, a.user.id).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "meal.planned", `${actor} asked Silvi to plan ${p.title} for ${p.mealType}.`); return `Planned ${p.title} for ${p.mealType} on ${p.mealDate}.`;
  }
  if (action.type === "meal.move") {
    const target = await c.env.DB.prepare("SELECT id FROM meal_plans WHERE household_id=? AND meal_date=? AND meal_type=? AND id<>?").bind(a.householdId, p.mealDate, p.mealType, p.planId).first(); if (target) throw new Error("There is now another meal in that slot. Ask Silvi again before replacing it.");
    const plan = await c.env.DB.prepare("SELECT title FROM meal_plans WHERE id=? AND household_id=?").bind(p.planId, a.householdId).first<{ title: string }>(); if (!plan) throw new Error("That planned meal could not be found.");
    await c.env.DB.prepare("UPDATE meal_plans SET meal_date=?,meal_type=?,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(p.mealDate, p.mealType, p.planId, a.householdId).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "meal.moved", `${actor} moved ${plan.title} with Silvi.`); return `Moved ${plan.title} to ${p.mealType} on ${p.mealDate}.`;
  }
  if (action.type === "routine.create") {
    const id = crypto.randomUUID(); await c.env.DB.prepare("INSERT INTO household_routines(id,household_id,title,notes,cadence,assignee_user_id,next_due_at,reminder_minutes,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(id, a.householdId, p.title, p.notes, p.cadence, p.assigneeUserId, p.nextDueAt, p.reminderMinutes, a.user.id).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "routine.add", `${actor} asked Silvi to add routine “${p.title}”.`); return `Created routine “${p.title}”.`;
  }
  if (action.type === "routine.assign") {
    const routine = await c.env.DB.prepare("SELECT title FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(p.routineId, a.householdId).first<{ title: string }>(); if (!routine) throw new Error("That routine could not be found.");
    await c.env.DB.prepare("UPDATE household_routines SET assignee_user_id=?,last_notified_due_at=NULL,snoozed_until=NULL,updated_at=datetime('now') WHERE id=? AND household_id=? AND active=1").bind(p.assigneeUserId, p.routineId, a.householdId).run(); await recordHouseholdActivity(c, a.householdId, a.user.id, "routine.updated", `${actor} reassigned “${routine.title}” with Silvi.`); return `Updated the assignment for “${routine.title}”.`;
  }
  if (action.type === "routine.complete") {
    const routine = await c.env.DB.prepare("SELECT title,cadence,next_due_at nextDueAt,assignee_user_id assigneeUserId FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(p.routineId, a.householdId).first<{ title: string; cadence: string; nextDueAt: string | null; assigneeUserId: string | null }>(); if (!routine) throw new Error("That routine is no longer active."); if (routine.assigneeUserId && routine.assigneeUserId !== a.user.id && !routineManager(a.role)) throw new Error("That routine is assigned to another household member.");
    await c.env.DB.batch([c.env.DB.prepare("INSERT INTO household_routine_completions(id,routine_id,household_id,completed_by) VALUES(?,?,?,?)").bind(crypto.randomUUID(), p.routineId, a.householdId, a.user.id), c.env.DB.prepare("UPDATE household_routines SET next_due_at=?,snoozed_until=NULL,last_notified_due_at=NULL,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(nextDue(routine.nextDueAt, routine.cadence), p.routineId, a.householdId)]); await recordHouseholdActivity(c, a.householdId, a.user.id, "routine.completed", `${actor} completed “${routine.title}” with Silvi.`); return `Marked routine “${routine.title}” as done.`;
  }
  throw new Error("That Silvi action is not supported.");
}

app.get("/api/v1/households/:householdId/silvi/context", async c => { const result = await access(c); if (!result.ok) return result.response; return c.json(await householdContext(c, result.value)); });

app.post("/api/v1/households/:householdId/silvi/ask", async c => {
  const result = await access(c); if (!result.ok) return result.response; const a = result.value;
  const body = await c.req.json().catch(() => null) as { question?: unknown } | null; const question = clean(body?.question, 700); if (!question) return apiError(c, 422, "VALIDATION_FAILED", "Ask Silvi a household question.");
  const context = await householdContext(c, a);
  const system = `You are Silvi, the private household assistant inside Kit Hub. Answer only from supplied household context; never invent household facts. You may PROPOSE exactly one change when the user clearly asks to change something, but never claim it already happened. Every proposal needs explicit user confirmation in Kit Hub. Supported types and payloads: task.create {title,notes?,priority?,dueAt?,assigneeUserId?}; task.update {taskId,title?,notes?,priority?,dueAt?,assigneeUserId?}; task.complete {taskId}; event.create {title,description?,location?,startsAt,endsAt?,allDay?,eventType?,recurrence?,reminderMinutes?}; event.update {eventId,title?,description?,location?,startsAt?,endsAt?,allDay?,recurrence?,reminderMinutes?}; meal.plan {mealDate,mealType,title,cookUserId?,notes?,reminderMinutes?}; meal.move {planId,mealDate,mealType}; routine.create {title,notes?,cadence?,assigneeUserId?,nextDueAt?,reminderMinutes?}; routine.assign {routineId,assigneeUserId}; routine.complete {routineId}. Only use IDs present in context and only propose actions allowed by capabilities. Resolve relative dates from currentTime and locale.timeZone. If details are missing/ambiguous, ask one short clarification and action=null. Return ONLY JSON: {"answer":"...","action":null} or {"answer":"... confirmation required ...","action":{"type":"supported.type","payload":{}}}. ISO timestamps for event/task/routine dates; YYYY-MM-DD for mealDate. No markdown.`;
  const prompt = `Current user: ${a.user.name ?? "Household member"}\nHousehold context JSON:\n${JSON.stringify(context)}\n\nUser request: ${question}`;
  try {
    const ai: any = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: 850, temperature: .12 });
    const raw = clean(ai?.response ?? ai?.result?.response ?? ai?.text, 7000); if (!raw) return apiError(c, 500, "SILVI_EMPTY_RESPONSE", "Silvi could not form an answer yet.");
    const envelope = parseEnvelope(raw); const action = await normalizeAction(c, a, envelope.action);
    if (!action) return c.json({ answer: envelope.answer, generatedAt: isoNow(), requiresConfirmation: false });
    const id = crypto.randomUUID(), expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await c.env.DB.prepare("INSERT INTO silvi_action_proposals(id,household_id,user_id,action_type,summary,payload_json,expires_at) VALUES(?,?,?,?,?,?,?)").bind(id, a.householdId, a.user.id, action.type, action.summary, JSON.stringify(action.payload), expiresAt).run();
    return c.json({ answer: envelope.answer, generatedAt: isoNow(), requiresConfirmation: true, proposal: { id, type: action.type, summary: action.summary, payload: action.payload, expiresAt } });
  } catch { return apiError(c, 500, "SILVI_UNAVAILABLE", "Silvi is unavailable right now. Your household data was not changed."); }
});

app.post("/api/v1/households/:householdId/silvi/actions/:proposalId/confirm", async c => {
  const result = await access(c); if (!result.ok) return result.response; const a = result.value;
  const body = await c.req.json().catch(() => null) as { confirm?: unknown } | null; if (body?.confirm !== true) return apiError(c, 422, "CONFIRMATION_REQUIRED", "Confirm this Silvi action before applying it.");
  const row = await c.env.DB.prepare("SELECT id,action_type actionType,payload_json payloadJson,status,expires_at expiresAt FROM silvi_action_proposals WHERE id=? AND household_id=? AND user_id=?").bind(c.req.param("proposalId"), a.householdId, a.user.id).first<{ id: string; actionType: ActionType; payloadJson: string; status: string; expiresAt: string }>();
  if (!row) return apiError(c, 404, "SILVI_PROPOSAL_NOT_FOUND", "That Silvi proposal could not be found."); if (row.status !== "pending") return apiError(c, 409, "SILVI_PROPOSAL_USED", "That Silvi proposal is no longer waiting for confirmation.");
  if (Date.parse(row.expiresAt) <= Date.now()) { await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='cancelled' WHERE id=? AND status='pending'").bind(row.id).run(); return apiError(c, 409, "SILVI_PROPOSAL_EXPIRED", "That Silvi proposal expired. Ask Silvi again so it can check the latest household information."); }
  const claimed = await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='executing' WHERE id=? AND household_id=? AND user_id=? AND status='pending'").bind(row.id, a.householdId, a.user.id).run(); if (!claimed.meta.changes) return apiError(c, 409, "SILVI_PROPOSAL_USED", "That Silvi proposal is already being handled.");
  try {
    const action = await normalizeAction(c, a, { type: row.actionType, payload: JSON.parse(row.payloadJson) as Record<string, unknown> }); if (!action) throw new Error("The household changed and this proposal is no longer valid.");
    const applied = await executeAction(c, a, action); await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='completed',executed_at=datetime('now') WHERE id=?").bind(row.id).run(); return c.json({ ok: true, result: applied, proposalId: row.id });
  } catch (error) { await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='failed' WHERE id=?").bind(row.id).run(); return apiError(c, 422, "SILVI_ACTION_FAILED", error instanceof Error ? error.message : "Silvi could not apply that change. Nothing else was changed."); }
});

app.post("/api/v1/households/:householdId/silvi/actions/:proposalId/cancel", async c => {
  const result = await access(c); if (!result.ok) return result.response; const a = result.value;
  const updated = await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='cancelled' WHERE id=? AND household_id=? AND user_id=? AND status='pending'").bind(c.req.param("proposalId"), a.householdId, a.user.id).run(); if (!updated.meta.changes) return apiError(c, 409, "SILVI_PROPOSAL_NOT_PENDING", "That Silvi proposal is no longer waiting for a decision."); return c.json({ cancelled: true });
});

export default app;
