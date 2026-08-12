import { describe, expect, it } from "vitest";
import { evaluatePullRequestReadiness, isTrustedAdminOrigin } from "./admin";

describe("platform admin request security", () => {
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

  it("publishes only a non-draft, mergeable main pull request with successful checks", () => {
    const ready = evaluatePullRequestReadiness({
      draft: false,
      baseBranch: "main",
      mergeable: true,
      checks: [{ status: "completed", conclusion: "success" }],
    });

    expect(ready).toMatchObject({ ready: true, checkState: "success", blockers: [] });
  });

  it("blocks drafts, conflicts, missing checks, pending checks, and failed checks", () => {
    expect(evaluatePullRequestReadiness({ draft: true, baseBranch: "main", mergeable: true, checks: [] })).toMatchObject({ ready: false, checkState: "missing" });
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "develop", mergeable: false, checks: [{ status: "completed", conclusion: "success" }] }).blockers).toHaveLength(2);
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "main", mergeable: true, checks: [{ status: "in_progress", conclusion: null }] })).toMatchObject({ ready: false, checkState: "pending" });
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "main", mergeable: true, checks: [{ status: "completed", conclusion: "failure" }] })).toMatchObject({ ready: false, checkState: "failure" });
  });
});
