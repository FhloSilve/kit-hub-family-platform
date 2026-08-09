import { describe, expect, it } from "vitest";
import { slugify, validateCreateHousehold, validateUpdateHousehold } from "./validation";

describe("slugify", () => {
  it("creates stable household slugs", () => {
    expect(slugify("Louisa & Mona's Cozy Home")).toBe("louisa-mona-s-cozy-home");
  });

  it("normalizes accented characters", () => {
    expect(slugify("Familie Dé Vos")).toBe("familie-de-vos");
  });
});

describe("validateCreateHousehold", () => {
  it("accepts a complete household", () => {
    expect(
      validateCreateHousehold({ name: "Fox Den", timezone: "Europe/Brussels", defaultLanguage: "nl" }),
    ).toEqual({
      ok: true,
      value: { name: "Fox Den", timezone: "Europe/Brussels", defaultLanguage: "nl" },
    });
  });

  it("returns field errors for unsafe input", () => {
    const result = validateCreateHousehold({ name: "x", timezone: "", defaultLanguage: "xx" });
    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({ name: expect.any(String), timezone: expect.any(String) });
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
