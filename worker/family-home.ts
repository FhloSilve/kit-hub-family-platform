import { Hono } from "hono";
import type {
  FamilyNote,
  HouseholdFocus,
  HouseholdRole,
} from "../shared/contracts";
import {
  validateFamilyNote,
  validateHouseholdFocus,
} from "../shared/validation";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();

async function getSessionUser(c: Parameters<typeof apiError>[0]) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

async function hasPermission(
  c: Parameters<typeof apiError>[0],
  householdId: string,
  userId: string,
  permissionKey: string,
) {
  const membership = await c.env.DB.prepare(
    "SELECT role_key AS roleKey FROM memberships WHERE household_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
  )
    .bind(householdId, userId)
    .first<{ roleKey: HouseholdRole }>();
  if (!membership) return false;

  const override = await c.env.DB.prepare(
    "SELECT effect FROM member_permission_overrides WHERE household_id = ? AND user_id = ? AND permission_key = ? LIMIT 1",
  )
    .bind(householdId, userId, permissionKey)
    .first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";

  const permission = await c.env.DB.prepare(
    "SELECT effect FROM role_permissions WHERE role_key = ? AND permission_key = ? LIMIT 1",
  )
    .bind(membership.roleKey, permissionKey)
    .first<{ effect: "allow" | "deny" }>();
  return permission?.effect === "allow";
}

async function readNote(
  c: Parameters<typeof apiError>[0],
  householdId: string,
  noteId: string,
) {
  return c.env.DB.prepare(
    `SELECT n.id, n.body, n.author_user_id AS authorUserId, u.name AS authorName,
            n.created_at AS createdAt, n.updated_at AS updatedAt
     FROM family_notes n
     INNER JOIN "user" u ON u.id = n.author_user_id
     WHERE n.id = ? AND n.household_id = ?`,
  )
    .bind(noteId, householdId)
    .first<FamilyNote>();
}

async function readFocus(
  c: Parameters<typeof apiError>[0],
  householdId: string,
) {
  return c.env.DB.prepare(
    `SELECT f.title, f.details, f.updated_by_user_id AS updatedByUserId,
            u.name AS updatedByName, f.updated_at AS updatedAt
     FROM household_focus f
     INNER JOIN "user" u ON u.id = f.updated_by_user_id
     WHERE f.household_id = ?`,
  )
    .bind(householdId)
    .first<HouseholdFocus>();
}

app.get("/api/v1/households/:householdId/home", async (c) => {
  const user = await getSessionUser(c);
  if (!user)
    return apiError(c, 401, "AUTH_REQUIRED", "Sign in to open your household.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "household.view"))) {
    return apiError(
      c,
      403,
      "HOUSEHOLD_VIEW_REQUIRED",
      "You do not have access to this household.",
    );
  }

  const [notes, focus, canManage] = await Promise.all([
    c.env.DB.prepare(
      `SELECT n.id, n.body, n.author_user_id AS authorUserId, u.name AS authorName,
              n.created_at AS createdAt, n.updated_at AS updatedAt
       FROM family_notes n
       INNER JOIN "user" u ON u.id = n.author_user_id
       WHERE n.household_id = ?
       ORDER BY n.updated_at DESC
       LIMIT 20`,
    )
      .bind(householdId)
      .all<FamilyNote>(),
    readFocus(c, householdId),
    hasPermission(c, householdId, user.id, "notes.manage"),
  ]);

  return c.json({ notes: notes.results, focus, canManage });
});

app.post("/api/v1/households/:householdId/notes", async (c) => {
  const user = await getSessionUser(c);
  if (!user)
    return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add a family note.");
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "notes.manage"))) {
    return apiError(
      c,
      403,
      "NOTES_MANAGE_REQUIRED",
      "You do not have permission to manage family notes.",
    );
  }

  const input = await c.req.json().catch(() => null);
  const validated = validateFamilyNote(input);
  if (!validated.ok || !validated.value) {
    return apiError(
      c,
      422,
      "VALIDATION_FAILED",
      "Please check the family note.",
      validated.errors,
    );
  }

  const noteId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO family_notes (id, household_id, body, author_user_id) VALUES (?, ?, ?, ?)",
  )
    .bind(noteId, householdId, validated.value.body, user.id)
    .run();
  const created = await readNote(c, householdId, noteId);
  return c.json(created, 201);
});

app.patch("/api/v1/households/:householdId/notes/:noteId", async (c) => {
  const user = await getSessionUser(c);
  if (!user)
    return apiError(
      c,
      401,
      "AUTH_REQUIRED",
      "Sign in to update a family note.",
    );
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "notes.manage"))) {
    return apiError(
      c,
      403,
      "NOTES_MANAGE_REQUIRED",
      "You do not have permission to manage family notes.",
    );
  }

  const input = await c.req.json().catch(() => null);
  const validated = validateFamilyNote(input);
  if (!validated.ok || !validated.value) {
    return apiError(
      c,
      422,
      "VALIDATION_FAILED",
      "Please check the family note.",
      validated.errors,
    );
  }

  const noteId = c.req.param("noteId");
  const result = await c.env.DB.prepare(
    "UPDATE family_notes SET body = ?, updated_at = datetime('now') WHERE id = ? AND household_id = ?",
  )
    .bind(validated.value.body, noteId, householdId)
    .run();
  if (!result.meta.changes)
    return apiError(
      c,
      404,
      "NOTE_NOT_FOUND",
      "That family note could not be found.",
    );
  return c.json(await readNote(c, householdId, noteId));
});

app.delete("/api/v1/households/:householdId/notes/:noteId", async (c) => {
  const user = await getSessionUser(c);
  if (!user)
    return apiError(
      c,
      401,
      "AUTH_REQUIRED",
      "Sign in to delete a family note.",
    );
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "notes.manage"))) {
    return apiError(
      c,
      403,
      "NOTES_MANAGE_REQUIRED",
      "You do not have permission to manage family notes.",
    );
  }

  const result = await c.env.DB.prepare(
    "DELETE FROM family_notes WHERE id = ? AND household_id = ?",
  )
    .bind(c.req.param("noteId"), householdId)
    .run();
  if (!result.meta.changes)
    return apiError(
      c,
      404,
      "NOTE_NOT_FOUND",
      "That family note could not be found.",
    );
  return c.json({ deleted: true });
});

app.put("/api/v1/households/:householdId/focus", async (c) => {
  const user = await getSessionUser(c);
  if (!user)
    return apiError(
      c,
      401,
      "AUTH_REQUIRED",
      "Sign in to update the household focus.",
    );
  const householdId = c.req.param("householdId");
  if (!(await hasPermission(c, householdId, user.id, "notes.manage"))) {
    return apiError(
      c,
      403,
      "NOTES_MANAGE_REQUIRED",
      "You do not have permission to update the household focus.",
    );
  }

  const input = await c.req.json().catch(() => null);
  const validated = validateHouseholdFocus(input);
  if (!validated.ok || !validated.value) {
    return apiError(
      c,
      422,
      "VALIDATION_FAILED",
      "Please check the household focus.",
      validated.errors,
    );
  }

  await c.env.DB.prepare(
    `INSERT INTO household_focus (household_id, title, details, updated_by_user_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(household_id) DO UPDATE SET
       title = excluded.title,
       details = excluded.details,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = datetime('now')`,
  )
    .bind(
      householdId,
      validated.value.title,
      validated.value.details || null,
      user.id,
    )
    .run();
  return c.json(await readFocus(c, householdId));
});

export default app;
