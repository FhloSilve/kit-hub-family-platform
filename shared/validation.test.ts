import { describe, expect, it } from "vitest";
import {
  slugify,
  validateCreateHousehold,
  validateFamilyNote,
  validateHouseholdFocus,
  validateUpdateHousehold,
} from "./validation";

describe("slugify", () => {
  it("creates stable household slugs", () => {
    expect(slugify("Louisa & Mona's Cozy Home")).toBe(
      "louisa-mona-s-cozy-home",
    );
  });

  it("normalizes accented characters", () => {
    expect(slugify("Familie Dé Vos")).toBe("familie-de-vos");
  });
});

describe("validateCreateHousehold", () => {
  it("accepts a complete household", () => {
    expect(
      validateCreateHousehold({
        name: "Fox Den",
        timezone: "Europe/Brussels",
        defaultLanguage: "nl",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Fox Den",
        timezone: "Europe/Brussels",
        defaultLanguage: "nl",
      },
    });
  });

  it("returns field errors for unsafe input", () => {
    const result = validateCreateHousehold({
      name: "x",
      timezone: "",
      defaultLanguage: "xx",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({
      name: expect.any(String),
      timezone: expect.any(String),
    });
  });
});

describe("validateUpdateHousehold", () => {
  it("trims and accepts a new household name", () => {
    expect(validateUpdateHousehold({ name: "  The Cozy Foxes  " })).toEqual({
      ok: true,
      value: { name: "The Cozy Foxes" },
    });
  });

  it("rejects an empty household name", () => {
    const result = validateUpdateHousehold({ name: " " });
    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({ name: expect.any(String) });
  });
});

describe("validateFamilyNote", () => {
  it("trims and accepts a shared note", () => {
    expect(validateFamilyNote({ body: "  Dinner is at seven.  " })).toEqual({
      ok: true,
      value: { body: "Dinner is at seven." },
    });
  });

  it("rejects an empty shared note", () => {
    expect(validateFamilyNote({ body: "   " }).ok).toBe(false);
  });
});

describe("validateHouseholdFocus", () => {
  it("accepts a headline with optional details", () => {
    expect(
      validateHouseholdFocus({
        title: "  School week  ",
        details: "  Pack lunches early.  ",
      }),
    ).toEqual({
      ok: true,
      value: { title: "School week", details: "Pack lunches early." },
    });
  });

  it("rejects an overlong focus headline", () => {
    expect(
      validateHouseholdFocus({ title: "x".repeat(81), details: "" }).ok,
    ).toBe(false);
  });
});
