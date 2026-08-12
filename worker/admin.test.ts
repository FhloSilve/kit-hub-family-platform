import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluatePullRequestReadiness, isTrustedAdminOrigin, markPullRequestReadyForReview } from "./admin";

afterEach(() => vi.unstubAllGlobals());

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

  it("publishes a mergeable main pull request with successful checks", () => {
    const ready = evaluatePullRequestReadiness({
      draft: false,
      baseBranch: "main",
      mergeable: true,
      checks: [{ status: "completed", conclusion: "success" }],
    });

    expect(ready).toMatchObject({ ready: true, checkState: "success", blockers: [] });
  });

  it("allows a checked draft to become ready after admin confirmation", () => {
    expect(evaluatePullRequestReadiness({ draft: true, baseBranch: "main", mergeable: true, checks: [{ status: "completed", conclusion: "success" }] })).toMatchObject({ ready: true, checkState: "success", blockers: [] });
  });

  it("marks the selected draft ready through GitHub GraphQL", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } }), { status: 200 }));
    vi.stubGlobal("fetch", request);

    await expect(markPullRequestReadyForReview({ GITHUB_RELEASE_TOKEN: "test-token" } as Env, { node_id: "PR_test", draft: true })).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("https://api.github.com/graphql", expect.objectContaining({ method: "POST" }));
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ variables: { pullRequestId: "PR_test" } });
  });

  it("blocks conflicts, missing checks, pending checks, and failed checks", () => {
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "main", mergeable: true, checks: [] })).toMatchObject({ ready: false, checkState: "missing" });
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "develop", mergeable: false, checks: [{ status: "completed", conclusion: "success" }] }).blockers).toHaveLength(2);
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "main", mergeable: true, checks: [{ status: "in_progress", conclusion: null }] })).toMatchObject({ ready: false, checkState: "pending" });
    expect(evaluatePullRequestReadiness({ draft: false, baseBranch: "main", mergeable: true, checks: [{ status: "completed", conclusion: "failure" }] })).toMatchObject({ ready: false, checkState: "failure" });
  });
});
