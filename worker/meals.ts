import { Hono } from "hono";
import type {
  GroceryItem,
  HouseholdRole,
  MealIngredient,
  MealPlan,
  MealRecipe,
  MealSuggestion,
} from "../shared/contracts";
import {
  validateMealPlan,
  validateMealRecipe,
  validateMealSettings,
  validateMealSuggestion,
} from "../shared/validation";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();

type AppContext = Parameters<typeof apiError>[0];
type RecipeRow = Omit<MealRecipe, "ingredients" | "favorite"> & { ingredientsJson: string; favorite: number };
type SuggestionRow = Omit<MealSuggestion, "votes" | "votedByMe"> & { votes: number; votedByMe: number };

async function getSessionUser(c: AppContext) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

async function hasPermission(c: AppContext, householdId: string, userId: string, permissionKey: string) {
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

function decodeIngredients(value: string): MealIngredient[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Partial<MealIngredient>;
      return typeof item.name === "string" && typeof item.quantity === "string"
        ? [{ name: item.name, quantity: item.quantity }]
        : [];
    });
  } catch {
    return [];
  }
}

function recipeFromRow(row: RecipeRow): MealRecipe {
  const { ingredientsJson, favorite, ...recipe } = row;
  return { ...recipe, ingredients: decodeIngredients(ingredientsJson), favorite: Boolean(favorite) };
}

async function readRecipe(c: AppContext, householdId: string, recipeId: string) {
  const row = await c.env.DB.prepare(
    `SELECT id, name, description, ingredients_json AS ingredientsJson, instructions,
            favorite, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM meal_recipes WHERE id = ? AND household_id = ?`,
  ).bind(recipeId, householdId).first<RecipeRow>();
  return row ? recipeFromRow(row) : null;
}

async function readPlan(c: AppContext, householdId: string, mealDate: string, mealType: string) {
  return c.env.DB.prepare(
    `SELECT p.id, p.meal_date AS mealDate, p.meal_type AS mealType, p.title,
            p.recipe_id AS recipeId, r.name AS recipeName, p.cook_user_id AS cookUserId,
            u.name AS cookName, p.notes, p.reminder_minutes AS reminderMinutes,
            p.created_at AS createdAt, p.updated_at AS updatedAt
     FROM meal_plans p
     LEFT JOIN meal_recipes r ON r.id = p.recipe_id
     LEFT JOIN "user" u ON u.id = p.cook_user_id
     WHERE p.household_id = ? AND p.meal_date = ? AND p.meal_type = ?`,
  ).bind(householdId, mealDate, mealType).first<MealPlan>();
}

async function requireView(c: AppContext, householdId: string, userId: string) {
  return hasPermission(c, householdId, userId, "household.view");
}

async function requireManage(c: AppContext, householdId: string, userId: string) {
  return hasPermission(c, householdId, userId, "meals.manage");
}

app.get("/api/v1/households/:householdId/meals", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to open meal planning.");
  const householdId = c.req.param("householdId");
  if (!(await requireView(c, householdId, user.id))) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");

  const [plans, recipes, suggestions, settings, canManage] = await Promise.all([
    c.env.DB.prepare(
      `SELECT p.id, p.meal_date AS mealDate, p.meal_type AS mealType, p.title,
              p.recipe_id AS recipeId, r.name AS recipeName, p.cook_user_id AS cookUserId,
              u.name AS cookName, p.notes, p.reminder_minutes AS reminderMinutes,
              p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM meal_plans p
       LEFT JOIN meal_recipes r ON r.id = p.recipe_id
       LEFT JOIN "user" u ON u.id = p.cook_user_id
       WHERE p.household_id = ?
       ORDER BY p.meal_date ASC,
         CASE p.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END`,
    ).bind(householdId).all<MealPlan>(),
    c.env.DB.prepare(
      `SELECT id, name, description, ingredients_json AS ingredientsJson, instructions,
              favorite, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM meal_recipes WHERE household_id = ? ORDER BY favorite DESC, name COLLATE NOCASE`,
    ).bind(householdId).all<RecipeRow>(),
    c.env.DB.prepare(
      `SELECT s.id, s.title, s.notes, s.meal_type AS mealType,
              s.suggested_by AS suggestedByUserId, u.name AS suggestedByName,
              (SELECT COUNT(*) FROM meal_suggestion_votes v WHERE v.suggestion_id = s.id) AS votes,
              EXISTS(SELECT 1 FROM meal_suggestion_votes mine WHERE mine.suggestion_id = s.id AND mine.user_id = ?) AS votedByMe,
              s.created_at AS createdAt
       FROM meal_suggestions s INNER JOIN "user" u ON u.id = s.suggested_by
       WHERE s.household_id = ? ORDER BY votes DESC, s.created_at DESC LIMIT 40`,
    ).bind(user.id, householdId).all<SuggestionRow>(),
    c.env.DB.prepare("SELECT dietary_notes AS dietaryNotes FROM meal_settings WHERE household_id = ?")
      .bind(householdId).first<{ dietaryNotes: string | null }>(),
    requireManage(c, householdId, user.id),
  ]);

  return c.json({
    plans: plans.results,
    recipes: recipes.results.map(recipeFromRow),
    suggestions: suggestions.results.map((suggestion) => ({ ...suggestion, votes: Number(suggestion.votes), votedByMe: Boolean(suggestion.votedByMe) })),
    dietaryNotes: settings?.dietaryNotes ?? null,
    canManage,
  });
});

app.post("/api/v1/households/:householdId/meals/plans", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to plan a meal.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage meals.");
  const validated = validateMealPlan(await c.req.json().catch(() => null));
  if (!validated.ok || !validated.value) return apiError(c, 422, "VALIDATION_FAILED", "Please check the meal details.", validated.errors);
  const input = validated.value;

  const [recipe, cook] = await Promise.all([
    input.recipeId ? c.env.DB.prepare("SELECT id FROM meal_recipes WHERE id = ? AND household_id = ?").bind(input.recipeId, householdId).first() : Promise.resolve(null),
    input.cookUserId ? c.env.DB.prepare("SELECT user_id FROM memberships WHERE household_id = ? AND user_id = ? AND status = 'active'").bind(householdId, input.cookUserId).first() : Promise.resolve(null),
  ]);
  if (input.recipeId && !recipe) return apiError(c, 422, "RECIPE_NOT_FOUND", "Choose a recipe from this household.");
  if (input.cookUserId && !cook) return apiError(c, 422, "COOK_NOT_FOUND", "Choose an active household member as cook.");

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO meal_plans
      (id, household_id, meal_date, meal_type, title, recipe_id, cook_user_id, notes, reminder_minutes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(household_id, meal_date, meal_type) DO UPDATE SET
       title = excluded.title, recipe_id = excluded.recipe_id, cook_user_id = excluded.cook_user_id,
       notes = excluded.notes, reminder_minutes = excluded.reminder_minutes, updated_at = datetime('now')`,
  ).bind(id, householdId, input.mealDate, input.mealType, input.title, input.recipeId, input.cookUserId, input.notes || null, input.reminderMinutes, user.id).run();
  return c.json(await readPlan(c, householdId, input.mealDate, input.mealType), 201);
});

app.delete("/api/v1/households/:householdId/meals/plans/:planId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to remove a meal.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage meals.");
  const result = await c.env.DB.prepare("DELETE FROM meal_plans WHERE id = ? AND household_id = ?").bind(c.req.param("planId"), householdId).run();
  if (!result.meta.changes) return apiError(c, 404, "MEAL_NOT_FOUND", "That planned meal could not be found.");
  return c.json({ deleted: true });
});

app.post("/api/v1/households/:householdId/meals/recipes", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to save a recipe.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage recipes.");
  const validated = validateMealRecipe(await c.req.json().catch(() => null));
  if (!validated.ok || !validated.value) return apiError(c, 422, "VALIDATION_FAILED", "Please check the recipe.", validated.errors);
  const input = validated.value;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO meal_recipes (id, household_id, name, description, ingredients_json, instructions, favorite, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, householdId, input.name, input.description || null, JSON.stringify(input.ingredients), input.instructions || null, input.favorite ? 1 : 0, user.id).run();
  return c.json(await readRecipe(c, householdId, id), 201);
});

app.put("/api/v1/households/:householdId/meals/recipes/:recipeId", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update a recipe.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage recipes.");
  const validated = validateMealRecipe(await c.req.json().catch(() => null));
  if (!validated.ok || !validated.value) return apiError(c, 422, "VALIDATION_FAILED", "Please check the recipe.", validated.errors);
  const input = validated.value;
  const result = await c.env.DB.prepare(
    `UPDATE meal_recipes SET name = ?, description = ?, ingredients_json = ?, instructions = ?, favorite = ?, updated_at = datetime('now')
     WHERE id = ? AND household_id = ?`,
  ).bind(input.name, input.description || null, JSON.stringify(input.ingredients), input.instructions || null, input.favorite ? 1 : 0, c.req.param("recipeId"), householdId).run();
  if (!result.meta.changes) return apiError(c, 404, "RECIPE_NOT_FOUND", "That recipe could not be found.");
  return c.json(await readRecipe(c, householdId, c.req.param("recipeId")));
});

app.patch("/api/v1/households/:householdId/meals/recipes/:recipeId/favorite", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update a favourite recipe.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage recipes.");
  const input = await c.req.json().catch(() => null) as { favorite?: unknown } | null;
  if (typeof input?.favorite !== "boolean") return apiError(c, 422, "VALIDATION_FAILED", "Choose whether this recipe is a favourite.");
  const result = await c.env.DB.prepare("UPDATE meal_recipes SET favorite = ?, updated_at = datetime('now') WHERE id = ? AND household_id = ?")
    .bind(input.favorite ? 1 : 0, c.req.param("recipeId"), householdId).run();
  if (!result.meta.changes) return apiError(c, 404, "RECIPE_NOT_FOUND", "That recipe could not be found.");
  return c.json(await readRecipe(c, householdId, c.req.param("recipeId")));
});

app.post("/api/v1/households/:householdId/meals/recipes/:recipeId/groceries", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to add recipe ingredients to groceries.");
  const householdId = c.req.param("householdId");
  const [canView, canManageGroceries] = await Promise.all([
    requireView(c, householdId, user.id),
    hasPermission(c, householdId, user.id, "groceries.manage"),
  ]);
  if (!canView) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  if (!canManageGroceries) return apiError(c, 403, "GROCERIES_MANAGE_REQUIRED", "You do not have permission to add groceries.");
  const recipe = await readRecipe(c, householdId, c.req.param("recipeId"));
  if (!recipe) return apiError(c, 404, "RECIPE_NOT_FOUND", "That recipe could not be found.");
  if (!recipe.ingredients.length) return c.json({ items: [], addedCount: 0 });
  const rows = recipe.ingredients.map((ingredient) => ({ id: crypto.randomUUID(), ...ingredient }));
  await c.env.DB.batch(rows.map((row) => c.env.DB.prepare(
    "INSERT INTO everyday_grocery_items (id, household_id, name, quantity, important, added_by) VALUES (?, ?, ?, ?, 0, ?)",
  ).bind(row.id, householdId, row.name, row.quantity, user.id)));
  const items: GroceryItem[] = rows.map((row) => ({ id: row.id, name: row.name, quantity: row.quantity, checked: false, important: false, createdAt: new Date().toISOString() }));
  return c.json({ items, addedCount: items.length }, 201);
});

app.post("/api/v1/households/:householdId/meals/suggestions", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to suggest a meal.");
  const householdId = c.req.param("householdId");
  if (!(await requireView(c, householdId, user.id))) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  const validated = validateMealSuggestion(await c.req.json().catch(() => null));
  if (!validated.ok || !validated.value) return apiError(c, 422, "VALIDATION_FAILED", "Please check the meal suggestion.", validated.errors);
  const input = validated.value;
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO meal_suggestions (id, household_id, title, notes, meal_type, suggested_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, householdId, input.title, input.notes || null, input.mealType || "dinner", user.id),
    c.env.DB.prepare("INSERT INTO meal_suggestion_votes (suggestion_id, user_id) VALUES (?, ?)").bind(id, user.id),
  ]);
  return c.json({ id, title: input.title, notes: input.notes || null, mealType: input.mealType || "dinner", suggestedByUserId: user.id, suggestedByName: user.name, votes: 1, votedByMe: true, createdAt: new Date().toISOString() } satisfies MealSuggestion, 201);
});

app.put("/api/v1/households/:householdId/meals/suggestions/:suggestionId/vote", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to vote for a meal.");
  const householdId = c.req.param("householdId");
  if (!(await requireView(c, householdId, user.id))) return apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.");
  const input = await c.req.json().catch(() => null) as { voted?: unknown } | null;
  if (typeof input?.voted !== "boolean") return apiError(c, 422, "VALIDATION_FAILED", "Choose whether to vote for this meal.");
  const suggestionId = c.req.param("suggestionId");
  const suggestion = await c.env.DB.prepare("SELECT id FROM meal_suggestions WHERE id = ? AND household_id = ?").bind(suggestionId, householdId).first();
  if (!suggestion) return apiError(c, 404, "SUGGESTION_NOT_FOUND", "That meal suggestion could not be found.");
  if (input.voted) await c.env.DB.prepare("INSERT OR IGNORE INTO meal_suggestion_votes (suggestion_id, user_id) VALUES (?, ?)").bind(suggestionId, user.id).run();
  else await c.env.DB.prepare("DELETE FROM meal_suggestion_votes WHERE suggestion_id = ? AND user_id = ?").bind(suggestionId, user.id).run();
  const votes = await c.env.DB.prepare("SELECT COUNT(*) AS votes FROM meal_suggestion_votes WHERE suggestion_id = ?").bind(suggestionId).first<{ votes: number }>();
  return c.json({ voted: input.voted, votes: Number(votes?.votes ?? 0) });
});

app.put("/api/v1/households/:householdId/meals/settings", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "AUTH_REQUIRED", "Sign in to update dietary notes.");
  const householdId = c.req.param("householdId");
  if (!(await requireManage(c, householdId, user.id))) return apiError(c, 403, "MEALS_MANAGE_REQUIRED", "You do not have permission to manage meal settings.");
  const validated = validateMealSettings(await c.req.json().catch(() => null));
  if (!validated.ok || !validated.value) return apiError(c, 422, "VALIDATION_FAILED", "Please check the dietary notes.", validated.errors);
  await c.env.DB.prepare(
    `INSERT INTO meal_settings (household_id, dietary_notes, updated_by) VALUES (?, ?, ?)
     ON CONFLICT(household_id) DO UPDATE SET dietary_notes = excluded.dietary_notes, updated_by = excluded.updated_by, updated_at = datetime('now')`,
  ).bind(householdId, validated.value.dietaryNotes || null, user.id).run();
  return c.json({ dietaryNotes: validated.value.dietaryNotes || null });
});

export default app;
