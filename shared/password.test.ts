import { describe, expect, it } from "vitest";
import { assessPassword } from "./password";

describe("assessPassword", () => {
  it("rejects short and low-variety passwords", () => {
    expect(assessPassword("short").acceptable).toBe(false);
    expect(assessPassword("abcdefghij").acceptable).toBe(false);
  });

  it("accepts a varied password without requiring every character class", () => {
    const strength = assessPassword("KitHubHome42");
    expect(strength.acceptable).toBe(true);
    expect(strength.score).toBeGreaterThanOrEqual(3);
  });

  it("accepts a long passphrase", () => {
    expect(assessPassword("our cozy family home").acceptable).toBe(true);
  });

  it("rates a long varied password as strong", () => {
    const strength = assessPassword("Kit-Hub-Family-2026!");
    expect(strength.acceptable).toBe(true);
    expect(strength.label).toBe("Strong");
  });
});
