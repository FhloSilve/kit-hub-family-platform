import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";
import type { BootstrapResponse, HouseholdRole, HouseholdSummary } from "../shared/contracts";
import { slugify, validateCreateHousehold } from "../shared/validation";

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
    service: "kit-hub-family-organizer",
    environment: c.env.APP_ENV,
    requestId: c.get("requestId"),
  }),
);

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

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, preferred_language, timezone)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         preferred_language = excluded.preferred_language,
         timezone = excluded.timezone,
         updated_at = datetime('now')`,
    ).bind(
      session.user.id,
      session.user.name,
      validated.value.defaultLanguage,
      validated.value.timezone,
    ),
    c.env.DB.prepare(
      `INSERT INTO households (id, name, slug, default_language, timezone, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      householdId,
      validated.value.name,
      slug,
      validated.value.defaultLanguage,
      validated.value.timezone,
      session.user.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO memberships (id, household_id, user_id, role_key, status, joined_at)
       VALUES (?, ?, ?, 'owner', 'active', datetime('now'))`,
    ).bind(membershipId, householdId, session.user.id),
    c.env.DB.prepare(
      `INSERT INTO audit_events
        (id, household_id, actor_user_id, action, resource_type, resource_id, result, request_id)
       VALUES (?, ?, ?, 'household.create', 'household', ?, 'success', ?)`,
    ).bind(auditId, householdId, session.user.id, householdId, c.get("requestId")),
  ]);

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
      path: c.req.path,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return apiError(c, 500, "INTERNAL_ERROR", "Kit Hub hit an unexpected problem. Please try again.");
});

export default app;
