import { Hono } from "hono";
import { createAuth } from "./auth";
import { buildHouseholdCreationWrites } from "./household-create";
import { apiError, type AppBindings } from "./http";
import type {
  BootstrapResponse,
  HouseholdRole,
  HouseholdSummary,
  UpdateHouseholdResponse,
} from "../shared/contracts";
import { slugify, validateCreateHousehold, validateUpdateHousehold } from "../shared/validation";

export { HouseholdRealtime } from "./household-realtime";

const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("x-request-id", requestId);
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
});

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "kit-hub-family-platform",
    environment: c.env.APP_ENV,
    requestId: c.get("requestId"),
  }),
);

app.get("/api/version", (c) => {
  c.header("cache-control", "no-store, no-cache, must-revalidate");
  const version = c.env.CF_VERSION_METADATA;
  return c.json({
    id: version.id,
    tag: version.tag ?? null,
    timestamp: version.timestamp ?? null,
  });
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

app.get("/api/v1/bootstrap", async (c) => {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.");
  }

  const memberships = await c.env.DB.prepare(
    `SELECT
      h.id,
      h.name,
      h.slug,
      h.default_language AS defaultLanguage,
      h.timezone,
      h.theme,
      m.role_key AS role,
      (SELECT COUNT(*) FROM memberships mc WHERE mc.household_id = h.id AND mc.status = 'active') AS memberCount
    FROM memberships m
    INNER JOIN households h ON h.id = m.household_id
    WHERE m.user_id = ? AND m.status = 'active' AND h.deleted_at IS NULL
    ORDER BY h.created_at ASC`,
  )
    .bind(session.user.id)
    .all<HouseholdSummary>();

  const households = memberships.results.map((household) => ({
    ...household,
    memberCount: Number(household.memberCount),
    role: household.role as HouseholdRole,
  }));

  const response: BootstrapResponse = {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
    },
    households,
    activeHousehold: households[0] ?? null,
  };

  return c.json(response);
});

app.post("/api/v1/households", async (c) => {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to create a household.");

  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return apiError(c, 422, "INVALID_JSON", "The household details could not be read.");
  }

  const validated = validateCreateHousehold(input);
  if (!validated.ok || !validated.value) {
    return apiError(
      c,
      422,
      "VALIDATION_FAILED",
      "Please check the highlighted household details.",
      validated.errors,
    );
  }

  const householdId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const slug = `${slugify(validated.value.name)}-${householdId.slice(0, 6)}`;
  const now = new Date().toISOString();

  try {
    const writes = buildHouseholdCreationWrites({
      householdId,
      membershipId,
      auditId,
      userId: session.user.id,
      userName: session.user.name,
      householdName: validated.value.name,
      slug,
      defaultLanguage: validated.value.defaultLanguage,
      timezone: validated.value.timezone,
      requestId: c.get("requestId"),
      now,
    });

    await c.env.DB.batch(
      writes.map(({ sql, values }) => c.env.DB.prepare(sql).bind(...values)),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "household_create_failed",
        requestId: c.get("requestId"),
        message: error instanceof Error ? error.message : "Unknown database error",
      }),
    );
    return apiError(
      c,
      500,
      "HOUSEHOLD_CREATE_FAILED",
      "We could not create your household. Please try again or share the reference below.",
    );
  }

  const created: HouseholdSummary = {
    id: householdId,
    name: validated.value.name,
    slug,
    role: "owner",
    memberCount: 1,
    defaultLanguage: validated.value.defaultLanguage,
    timezone: validated.value.timezone,
    theme: "meadow",
  };

  return c.json(created, 201);
});

app.patch("/api/v1/households/:householdId", async (c) => {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update this household.");

  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return apiError(c, 422, "INVALID_JSON", "The household details could not be read.");
  }

  const validated = validateUpdateHousehold(input);
  if (!validated.ok || !validated.value) {
    return apiError(
      c,
      422,
      "VALIDATION_FAILED",
      "Please check the highlighted household details.",
      validated.errors,
    );
  }

  const householdId = c.req.param("householdId");
  const permission = await c.env.DB.prepare(
    `SELECT 1 AS allowed
     FROM memberships m
     INNER JOIN role_permissions rp ON rp.role_key = m.role_key
     WHERE m.household_id = ?
       AND m.user_id = ?
       AND m.status = 'active'
       AND rp.permission_key = 'household.manage'
       AND rp.effect = 'allow'
     LIMIT 1`,
  )
    .bind(householdId, session.user.id)
    .first<{ allowed: number }>();

  if (!permission) {
    return apiError(c, 403, "HOUSEHOLD_MANAGE_REQUIRED", "You do not have permission to change this household.");
  }

  const auditId = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE households
         SET name = ?, updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
      ).bind(validated.value.name, householdId),
      c.env.DB.prepare(
        `INSERT INTO audit_events
          (id, household_id, actor_user_id, action, resource_type, resource_id, result, request_id)
         VALUES (?, ?, ?, 'household.update', 'household', ?, 'success', ?)`,
      ).bind(auditId, householdId, session.user.id, householdId, c.get("requestId")),
    ]);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "household_update_failed",
        requestId: c.get("requestId"),
        householdId,
        message: error instanceof Error ? error.message : "Unknown database error",
      }),
    );
    return apiError(
      c,
      500,
      "HOUSEHOLD_UPDATE_FAILED",
      "We could not save the household name. Please try again or share the reference below.",
    );
  }

  const response: UpdateHouseholdResponse = {
    id: householdId,
    name: validated.value.name,
  };
  return c.json(response);
});


async function hasHouseholdPermission(c: Parameters<typeof apiError>[0], householdId: string, userId: string, permissionKey: string) {
  const membership = await c.env.DB.prepare(
    "SELECT role_key AS roleKey FROM memberships WHERE household_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
  ).bind(householdId, userId).first<{ roleKey: HouseholdRole }>();
  if (!membership) return false;

  const override = await c.env.DB.prepare(
    `SELECT effect FROM member_permission_overrides
     WHERE household_id = ? AND user_id = ? AND permission_key = ? LIMIT 1`,
  ).bind(householdId, userId, permissionKey).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";

  const permission = await c.env.DB.prepare(
    "SELECT effect FROM role_permissions WHERE role_key = ? AND permission_key = ? LIMIT 1",
  ).bind(membership.roleKey, permissionKey).first<{ effect: "allow" | "deny" }>();
  return permission?.effect === "allow";
}

async function getSessionUser(c: Parameters<typeof apiError>[0]) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

app.get("/api/v1/households/:householdId/everyday", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to open your household.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "household.view"))) {
    return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  }

  const [members, tasks, groceries, events] = await Promise.all([
    c.env.DB.prepare(
      `SELECT m.id, m.user_id AS userId, u.name, u.email, m.role_key AS role, m.joined_at AS joinedAt
       FROM memberships m INNER JOIN "user" u ON u.id = m.user_id
       WHERE m.household_id = ? AND m.status = 'active'
       ORDER BY CASE m.role_key WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name COLLATE NOCASE`,
    ).bind(householdId).all(),
    c.env.DB.prepare(
      `SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at AS dueAt,
              t.assignee_user_id AS assigneeUserId, u.name AS assigneeName, t.created_at AS createdAt
       FROM everyday_tasks t LEFT JOIN "user" u ON u.id = t.assignee_user_id
       WHERE t.household_id = ?
       ORDER BY CASE t.status WHEN 'todo' THEN 0 ELSE 1 END,
                CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.created_at DESC`,
    ).bind(householdId).all(),
    c.env.DB.prepare(
      `SELECT id, name, quantity, checked, created_at AS createdAt
       FROM everyday_grocery_items WHERE household_id = ?
       ORDER BY checked ASC, created_at DESC`,
    ).bind(householdId).all(),
    c.env.DB.prepare(
      `SELECT id, title, description, location, starts_at AS startsAt, ends_at AS endsAt,
              all_day AS allDay, created_at AS createdAt
       FROM everyday_events WHERE household_id = ?
       ORDER BY starts_at ASC`,
    ).bind(householdId).all(),
  ]);

  return c.json({
    members: members.results,
    tasks: tasks.results,
    groceries: groceries.results.map((item: Record<string, unknown>) => ({ ...item, checked: Boolean(item.checked) })),
    events: events.results.map((event: Record<string, unknown>) => ({ ...event, allDay: Boolean(event.allDay) })),
  });
});

app.post("/api/v1/households/:householdId/tasks", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add a task.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "tasks.manage"))) {
    return apiError(c, 403, "TASKS_MANAGE_REQUIRED", "You do not have permission to manage tasks.");
  }
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 160) return apiError(c, 422, "VALIDATION_FAILED", "Task title must be between 1 and 160 characters.");
  const priority = input?.priority === "low" || input?.priority === "high" ? input.priority : "normal";
  const dueAt = typeof input?.dueAt === "string" && input.dueAt ? input.dueAt : null;
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return apiError(c, 422, "VALIDATION_FAILED", "Task due date is not valid.");
  const assigneeUserId = typeof input?.assigneeUserId === "string" && input.assigneeUserId ? input.assigneeUserId : null;
  if (assigneeUserId) {
    const member = await c.env.DB.prepare("SELECT 1 AS ok FROM memberships WHERE household_id = ? AND user_id = ? AND status = 'active'").bind(householdId, assigneeUserId).first();
    if (!member) return apiError(c, 422, "ASSIGNEE_NOT_MEMBER", "That assignee is not an active household member.");
  }
  const id = crypto.randomUUID();
  const notes = typeof input?.notes === "string" ? input.notes.trim().slice(0, 2000) || null : null;
  await c.env.DB.prepare(
    "INSERT INTO everyday_tasks (id, household_id, title, notes, priority, due_at, assignee_user_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, householdId, title, notes, priority, dueAt, assigneeUserId, user.id).run();
  const created = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at AS dueAt,
            t.assignee_user_id AS assigneeUserId, u.name AS assigneeName, t.created_at AS createdAt
     FROM everyday_tasks t LEFT JOIN "user" u ON u.id = t.assignee_user_id WHERE t.id = ?`,
  ).bind(id).first();
  return c.json(created, 201);
});

app.patch("/api/v1/households/:householdId/tasks/:taskId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update a task.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "tasks.manage"))) return apiError(c, 403, "TASKS_MANAGE_REQUIRED", "You do not have permission to manage tasks.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (input?.status !== "todo" && input?.status !== "done") return apiError(c, 422, "VALIDATION_FAILED", "Task status is not valid.");
  const result = await c.env.DB.prepare("UPDATE everyday_tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND household_id = ?")
    .bind(input.status, c.req.param("taskId"), householdId).run();
  if (!result.meta.changes) return apiError(c, 404, "TASK_NOT_FOUND", "That task could not be found.");
  const updated = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.notes, t.status, t.priority, t.due_at AS dueAt,
            t.assignee_user_id AS assigneeUserId, u.name AS assigneeName, t.created_at AS createdAt
     FROM everyday_tasks t LEFT JOIN "user" u ON u.id = t.assignee_user_id WHERE t.id = ?`,
  ).bind(c.req.param("taskId")).first();
  return c.json(updated);
});

app.post("/api/v1/households/:householdId/groceries", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add groceries.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "groceries.manage"))) return apiError(c, 403, "GROCERIES_MANAGE_REQUIRED", "You do not have permission to manage groceries.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) return apiError(c, 422, "VALIDATION_FAILED", "Grocery item must be between 1 and 120 characters.");
  const quantity = typeof input?.quantity === "string" ? input.quantity.trim().slice(0, 40) || "1" : "1";
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO everyday_grocery_items (id, household_id, name, quantity, added_by) VALUES (?, ?, ?, ?, ?)")
    .bind(id, householdId, name, quantity, user.id).run();
  const created = await c.env.DB.prepare("SELECT id, name, quantity, checked, created_at AS createdAt FROM everyday_grocery_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json({ ...created, checked: Boolean(created?.checked) }, 201);
});

app.patch("/api/v1/households/:householdId/groceries/:itemId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update groceries.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "groceries.manage"))) return apiError(c, 403, "GROCERIES_MANAGE_REQUIRED", "You do not have permission to manage groceries.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof input?.checked !== "boolean") return apiError(c, 422, "VALIDATION_FAILED", "Grocery state is not valid.");
  const result = await c.env.DB.prepare("UPDATE everyday_grocery_items SET checked = ?, updated_at = datetime('now') WHERE id = ? AND household_id = ?")
    .bind(input.checked ? 1 : 0, c.req.param("itemId"), householdId).run();
  if (!result.meta.changes) return apiError(c, 404, "GROCERY_NOT_FOUND", "That grocery item could not be found.");
  const updated = await c.env.DB.prepare("SELECT id, name, quantity, checked, created_at AS createdAt FROM everyday_grocery_items WHERE id = ?").bind(c.req.param("itemId")).first<Record<string, unknown>>();
  return c.json({ ...updated, checked: Boolean(updated?.checked) });
});

app.post("/api/v1/households/:householdId/events", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add an event.");
  const householdId = c.req.param("householdId");
  if (!(await hasHouseholdPermission(c, householdId, user.id, "calendar.manage"))) return apiError(c, 403, "CALENDAR_MANAGE_REQUIRED", "You do not have permission to manage the calendar.");
  const input = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const startsAt = typeof input?.startsAt === "string" ? input.startsAt : "";
  if (!title || title.length > 160) return apiError(c, 422, "VALIDATION_FAILED", "Event title must be between 1 and 160 characters.");
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return apiError(c, 422, "VALIDATION_FAILED", "Event start date is not valid.");
  const endsAt = typeof input?.endsAt === "string" && input.endsAt ? input.endsAt : null;
  if (endsAt && (Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) < Date.parse(startsAt))) return apiError(c, 422, "VALIDATION_FAILED", "Event end must be after its start.");
  const id = crypto.randomUUID();
  const description = typeof input?.description === "string" ? input.description.trim().slice(0, 2000) || null : null;
  const location = typeof input?.location === "string" ? input.location.trim().slice(0, 180) || null : null;
  const allDay = input?.allDay === true;
  await c.env.DB.prepare(
    "INSERT INTO everyday_events (id, household_id, title, description, location, starts_at, ends_at, all_day, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, householdId, title, description, location, startsAt, endsAt, allDay ? 1 : 0, user.id).run();
  const created = await c.env.DB.prepare(
    "SELECT id, title, description, location, starts_at AS startsAt, ends_at AS endsAt, all_day AS allDay, created_at AS createdAt FROM everyday_events WHERE id = ?",
  ).bind(id).first<Record<string, unknown>>();
  return c.json({ ...created, allDay: Boolean(created?.allDay) }, 201);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return apiError(c, 404, "NOT_FOUND", "That Kit Hub API route does not exist.");
  }
  return new Response("Not found", { status: 404 });
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return apiError(c, 500, "INTERNAL_ERROR", "Kit Hub hit an unexpected problem. Please try again.");
});

export default app;
