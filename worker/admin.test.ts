import { describe, expect, it } from "vitest";
import { isFreshAdminSession, isTrustedAdminOrigin } from "./admin";

describe("platform admin request security", () => {
  it("requires sessions created within the fifteen-minute freshness window", () => {
    const now = Date.parse("2026-08-12T09:00:00.000Z");

    expect(isFreshAdminSession(new Date("2026-08-12T08:46:00.000Z"), now)).toBe(true);
    expect(isFreshAdminSession("2026-08-12T08:44:00.000Z", now)).toBe(false);
    expect(isFreshAdminSession(new Date("2026-08-12T09:01:00.000Z"), now)).toBe(false);
  });

  it("accepts only the configured production origin", () => {
    const trusted = new Request("https://kit-hub.example/api/v1/admin/releases", {
      method: "POST",
      headers: { origin: "https://kit-hub.example" },
    });
    const crossOrigin = new Request("https://kit-hub.example/api/v1/admin/releases", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const missingOrigin = new Request("https://kit-hub.example/api/v1/admin/releases", {
      method: "POST",
    });

    expect(isTrustedAdminOrigin(trusted, "https://kit-hub.example")).toBe(true);
    expect(isTrustedAdminOrigin(crossOrigin, "https://kit-hub.example")).toBe(false);
    expect(isTrustedAdminOrigin(missingOrigin, "https://kit-hub.example")).toBe(false);
  });

  it("allows the exact local development origin without trusting arbitrary hosts", () => {
    const local = new Request("http://localhost:5173/api/v1/admin/releases", {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
    });

    expect(isTrustedAdminOrigin(local, "https://kit-hub.example")).toBe(true);
  });
});
