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
