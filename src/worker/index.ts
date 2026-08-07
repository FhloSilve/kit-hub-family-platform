import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import type {
  Bindings,
  HouseholdMembership,
  SessionUser,
} from "./types";
import {
  grocerySchema,
  groceryUpdateSchema,
  householdSchema,
  taskSchema,
  taskUpdateSchema,
} from "./validation";

type AppEnv = { Bindings: Bindings };

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: "kit-hub", time: new Date().toISOString() }),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  return auth.handler(c.req.raw);
});

app.get("/api/bootstrap", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const membership = await getMembership(c.env.DB, user.id);

  if (!membership) {
    return c.json({ user, household: null });
  }
  const canSeeAdmin = membership.role === "owner" || membership.role === "admin";

  const [members, tasks, groceries, events, notes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT hm.id, hm.display_name AS displayName, hm.role, u.email
       FROM household_member hm
       JOIN user u ON u.id = hm.user_id
       WHERE hm.household_id = ?
       ORDER BY CASE hm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                hm.created_at ASC`,
    )
      .bind(membership.householdId)
      .all(),
    c.env.DB.prepare(
      `SELECT id, title, status, priority, due_at AS dueAt, created_at AS createdAt
       FROM task
       WHERE household_id = ?
         AND (visibility = 'household' OR created_by = ? OR (visibility = 'admin' AND ? = 1))
       ORDER BY status ASC,
                CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                COALESCE(due_at, 9223372036854775807) ASC
       LIMIT 20`,
    )
      .bind(membership.householdId, user.id, canSeeAdmin ? 1 : 0)
      .all(),
    c.env.DB.prepare(
      `SELECT id, name, quantity, checked, created_at AS createdAt
       FROM grocery_item
       WHERE household_id = ?
       ORDER BY checked ASC, created_at DESC
       LIMIT 30`,
    )
      .bind(membership.householdId)
      .all(),
    c.env.DB.prepare(
      `SELECT id, title, starts_at AS startsAt, ends_at AS endsAt, location
       FROM event
       WHERE household_id = ? AND starts_at >= ?
         AND (visibility = 'household' OR created_by = ? OR (visibility = 'admin' AND ? = 1))
       ORDER BY starts_at ASC
       LIMIT 5`,
    )
      .bind(
        membership.householdId,
        Date.now() - 86_400_000,
        user.id,
        canSeeAdmin ? 1 : 0,
      )
      .all(),
    c.env.DB.prepare(
      `SELECT id, title, body, visibility, updated_at AS updatedAt
       FROM note
       WHERE household_id = ?
         AND (visibility = 'household' OR created_by = ? OR (visibility = 'admin' AND ? = 1))
       ORDER BY updated_at DESC
       LIMIT 4`,
    )
      .bind(membership.householdId, user.id, canSeeAdmin ? 1 : 0)
      .all(),
  ]);

  return c.json({
    user,
    household: {
      id: membership.householdId,
      name: membership.householdName,
      slug: membership.householdSlug,
      role: membership.role,
      members: members.results,
      tasks: tasks.results,
      groceries: groceries.results,
      events: events.results,
      notes: notes.results,
    },
  });
});

app.post("/api/households", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const existing = await getMembership(c.env.DB, user.id);
  if (existing) {
    throw new HTTPException(409, { message: "You already belong to a household" });
  }

  const input = householdSchema.parse(await c.req.json());
  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = Date.now();
  const slug = `${slugify(input.name)}-${householdId.slice(0, 6)}`;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO household (id, name, slug, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(householdId, input.name, slug, user.id, now, now),
    c.env.DB.prepare(
      `INSERT INTO household_member
       (id, household_id, user_id, role, display_name, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', ?, ?, ?)`,
    ).bind(memberId, householdId, user.id, user.name, now, now),
  ]);

  return c.json({ id: householdId, name: input.name, slug }, 201);
});

app.post("/api/tasks", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const membership = await requireMembership(c.env.DB, user.id);
  const input = taskSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO task
     (id, household_id, title, status, priority, due_at, created_by, visibility, created_at, updated_at)
     VALUES (?, ?, ?, 'todo', ?, ?, ?, 'household', ?, ?)`,
  )
    .bind(
      id,
      membership.householdId,
      input.title,
      input.priority,
      input.dueAt ? Date.parse(input.dueAt) : null,
      user.id,
      now,
      now,
    )
    .run();

  return c.json({ id }, 201);
});

app.patch("/api/tasks/:id", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const membership = await requireMembership(c.env.DB, user.id);
  const input = taskUpdateSchema.parse(await c.req.json());
  const canManageAdmin = membership.role === "owner" || membership.role === "admin";
  const result = await c.env.DB.prepare(
    `UPDATE task SET status = ?, updated_at = ?
     WHERE id = ? AND household_id = ?
       AND (visibility = 'household' OR created_by = ? OR (visibility = 'admin' AND ? = 1))`,
  )
    .bind(
      input.status,
      Date.now(),
      c.req.param("id"),
      membership.householdId,
      user.id,
      canManageAdmin ? 1 : 0,
    )
    .run();

  if (!result.meta.changes) {
    throw new HTTPException(404, { message: "Task not found" });
  }
  return c.json({ ok: true });
});

app.post("/api/groceries", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const membership = await requireMembership(c.env.DB, user.id);
  const input = grocerySchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO grocery_item
     (id, household_id, name, quantity, checked, added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(id, membership.householdId, input.name, input.quantity, user.id, now, now)
    .run();

  return c.json({ id }, 201);
});

app.patch("/api/groceries/:id", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  const membership = await requireMembership(c.env.DB, user.id);
  const input = groceryUpdateSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare(
    `UPDATE grocery_item SET checked = ?, updated_at = ?
     WHERE id = ? AND household_id = ?`,
  )
    .bind(input.checked ? 1 : 0, Date.now(), c.req.param("id"), membership.householdId)
    .run();

  if (!result.meta.changes) {
    throw new HTTPException(404, { message: "Grocery item not found" });
  }
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }

  if (error instanceof Error && error.name === "ZodError") {
    return c.json({ error: "Please check the entered information" }, 400);
  }

  console.error(
    JSON.stringify({
      message: "request failed",
      error: error instanceof Error ? error.message : String(error),
      path: new URL(c.req.url).pathname,
    }),
  );
  return c.json({ error: "Something went wrong" }, 500);
});

async function requireUser(request: Request, env: Bindings): Promise<SessionUser> {
  const auth = createAuth(env, new URL(request.url).origin);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new HTTPException(401, { message: "Please sign in" });
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}

async function getMembership(
  db: D1Database,
  userId: string,
): Promise<HouseholdMembership | null> {
  return db
    .prepare(
      `SELECT hm.id AS memberId, hm.household_id AS householdId,
              hm.role, hm.display_name AS displayName,
              h.name AS householdName, h.slug AS householdSlug
       FROM household_member hm
       JOIN household h ON h.id = hm.household_id
       WHERE hm.user_id = ?
       ORDER BY hm.created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<HouseholdMembership>();
}

async function requireMembership(
  db: D1Database,
  userId: string,
): Promise<HouseholdMembership> {
  const membership = await getMembership(db, userId);
  if (!membership) {
    throw new HTTPException(403, { message: "Create or join a household first" });
  }
  return membership;
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "household"
  );
}

export default app;
