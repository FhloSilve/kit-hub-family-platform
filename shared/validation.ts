import type {
  CreateHouseholdInput,
  SaveFamilyNoteInput,
  SaveHouseholdFocusInput,
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
