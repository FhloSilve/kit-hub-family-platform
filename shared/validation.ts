import type {
  CreateHouseholdInput,
  SaveFamilyNoteInput,
  SaveHouseholdFocusInput,
  SaveMealPlanInput,
  SaveMealRecipeInput,
  SaveMealSettingsInput,
  SaveMealSuggestionInput,
  MealIngredient,
  MealType,
  UpdateHouseholdInput,
} from "./contracts";

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors?: Record<string, string>;
}

const supportedLanguages = new Set(["en", "nl", "fr", "de", "es"]);

function validateHouseholdName(
  value: unknown,
): ValidationResult<UpdateHouseholdInput> {
  const name = typeof value === "string" ? value.trim() : "";
  const errors: Record<string, string> = {};

  if (name.length < 2) errors.name = "Use at least 2 characters.";
  if (name.length > 64)
    errors.name = "Keep the household name under 65 characters.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name } };
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function validateCreateHousehold(
  value: unknown,
): ValidationResult<CreateHouseholdInput> {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      errors: { form: "Please complete the household details." },
    };
  }

  const input = value as Partial<CreateHouseholdInput>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const timezone =
    typeof input.timezone === "string" ? input.timezone.trim() : "";
  const defaultLanguage =
    typeof input.defaultLanguage === "string"
      ? input.defaultLanguage.trim().toLowerCase()
      : "";
  const errors: Record<string, string> = {};

  const nameValidation = validateHouseholdName(name);
  if (!nameValidation.ok) Object.assign(errors, nameValidation.errors);
  if (!timezone || timezone.length > 64)
    errors.timezone = "Choose a valid time zone.";
  if (!supportedLanguages.has(defaultLanguage)) {
    errors.defaultLanguage = "Choose a supported language.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, timezone, defaultLanguage } };
}

export function validateUpdateHousehold(
  value: unknown,
): ValidationResult<UpdateHouseholdInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: { form: "Please enter a household name." } };
  }

  return validateHouseholdName((value as Partial<UpdateHouseholdInput>).name);
}

export function validateFamilyNote(
  value: unknown,
): ValidationResult<SaveFamilyNoteInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: { body: "Write a note before saving." } };
  }

  const body =
    typeof (value as Partial<SaveFamilyNoteInput>).body === "string"
      ? (value as Partial<SaveFamilyNoteInput>).body!.trim()
      : "";
  if (!body)
    return { ok: false, errors: { body: "Write a note before saving." } };
  if (body.length > 500)
    return {
      ok: false,
      errors: { body: "Keep the note under 501 characters." },
    };
  return { ok: true, value: { body } };
}

export function validateHouseholdFocus(
  value: unknown,
): ValidationResult<SaveHouseholdFocusInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: { title: "Add a short focus headline." } };
  }

  const input = value as Partial<SaveHouseholdFocusInput>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Add a short focus headline.";
  if (title.length > 80)
    errors.title = "Keep the headline under 81 characters.";
  if (details.length > 400)
    errors.details = "Keep the details under 401 characters.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, details } };
}

const mealTypes = new Set<MealType>(["breakfast", "lunch", "dinner", "snack"]);

function cleanOptionalText(value: unknown, limit: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return { text, tooLong: text.length > limit };
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateMealPlan(value: unknown): ValidationResult<SaveMealPlanInput> {
  if (!value || typeof value !== "object") return { ok: false, errors: { form: "Complete the meal details." } };
  const input = value as Partial<SaveMealPlanInput>;
  const mealDate = typeof input.mealDate === "string" ? input.mealDate.trim() : "";
  const mealType = input.mealType;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const recipeId = typeof input.recipeId === "string" && input.recipeId.trim() ? input.recipeId.trim() : null;
  const cookUserId = typeof input.cookUserId === "string" && input.cookUserId.trim() ? input.cookUserId.trim() : null;
  const notes = cleanOptionalText(input.notes, 500);
  const reminderMinutes = input.reminderMinutes == null ? null : input.reminderMinutes;
  const errors: Record<string, string> = {};
  if (!isIsoDate(mealDate)) errors.mealDate = "Choose a valid meal date.";
  if (!mealType || !mealTypes.has(mealType)) errors.mealType = "Choose a meal type.";
  if (!title) errors.title = "Name the meal.";
  if (title.length > 120) errors.title = "Keep the meal name under 121 characters.";
  if (notes.tooLong) errors.notes = "Keep meal notes under 501 characters.";
  if (reminderMinutes !== null && (!Number.isInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 10080)) errors.reminderMinutes = "Choose a valid reminder.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { mealDate, mealType: mealType!, title, recipeId, cookUserId, notes: notes.text, reminderMinutes } };
}

export function validateMealRecipe(value: unknown): ValidationResult<SaveMealRecipeInput> {
  if (!value || typeof value !== "object") return { ok: false, errors: { form: "Complete the recipe details." } };
  const input = value as Partial<SaveMealRecipeInput>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = cleanOptionalText(input.description, 500);
  const instructions = cleanOptionalText(input.instructions, 3000);
  const rawIngredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const ingredients: MealIngredient[] = rawIngredients.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const ingredient = raw as Partial<MealIngredient>;
    const ingredientName = typeof ingredient.name === "string" ? ingredient.name.trim() : "";
    const quantity = typeof ingredient.quantity === "string" ? ingredient.quantity.trim() : "";
    return ingredientName ? [{ name: ingredientName, quantity: quantity || "1" }] : [];
  });
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name the recipe.";
  if (name.length > 120) errors.name = "Keep the recipe name under 121 characters.";
  if (description.tooLong) errors.description = "Keep the description under 501 characters.";
  if (instructions.tooLong) errors.instructions = "Keep instructions under 3001 characters.";
  if (!ingredients.length) errors.ingredients = "Add at least one ingredient.";
  if (ingredients.length > 80 || ingredients.some((item) => item.name.length > 120 || item.quantity.length > 40)) errors.ingredients = "Use up to 80 short ingredients.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, description: description.text, ingredients, instructions: instructions.text, favorite: input.favorite === true } };
}

export function validateMealSuggestion(value: unknown): ValidationResult<SaveMealSuggestionInput> {
  if (!value || typeof value !== "object") return { ok: false, errors: { form: "Add a meal suggestion." } };
  const input = value as Partial<SaveMealSuggestionInput>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const notes = cleanOptionalText(input.notes, 300);
  const mealType = input.mealType && mealTypes.has(input.mealType) ? input.mealType : "dinner";
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Name the meal suggestion.";
  if (title.length > 120) errors.title = "Keep the suggestion under 121 characters.";
  if (notes.tooLong) errors.notes = "Keep suggestion notes under 301 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, notes: notes.text, mealType } };
}

export function validateMealSettings(value: unknown): ValidationResult<SaveMealSettingsInput> {
  if (!value || typeof value !== "object") return { ok: false, errors: { dietaryNotes: "Add dietary notes or leave the field empty." } };
  const dietaryNotes = typeof (value as Partial<SaveMealSettingsInput>).dietaryNotes === "string" ? (value as Partial<SaveMealSettingsInput>).dietaryNotes!.trim() : "";
  if (dietaryNotes.length > 1000) return { ok: false, errors: { dietaryNotes: "Keep dietary and allergy notes under 1001 characters." } };
  return { ok: true, value: { dietaryNotes } };
}
