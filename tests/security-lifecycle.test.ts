import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("security lifecycle guardrails", () => {
  it("stores only hashed household invite tokens", () => {
    const source = read("worker/invites.ts");
    expect(source).toContain('crypto.subtle.digest("SHA-256"');
    expect(source).toContain("token_hash");
    expect(source).not.toContain("invite_token TEXT");
  });

  it("binds invite acceptance to the invited email and one pending token", () => {
    const source = read("worker/invites.ts");
    expect(source).toContain("INVITE_EMAIL_MISMATCH");
    expect(source).toContain("status='accepted'");
    expect(source).toContain("status='pending'");
  });

  it("requires explicit deletion confirmation and a cooling-off period", () => {
    const source = read("worker/account-lifecycle.ts");
    expect(source).toContain('body?.confirmation!=="DELETE MY ACCOUNT"');
    expect(source).toContain("datetime('now','+24 hour')");
    expect(source).toContain("OWNS_HOUSEHOLD");
  });

  it("keeps security routes mounted in the worker entry", () => {
    const entry = read("worker/entry.ts");
    expect(entry).toContain('import invites from "./invites"');
    expect(entry).toContain('import accountLifecycle from "./account-lifecycle"');
    expect(entry).toContain('app.route("/", accountLifecycle)');
    expect(entry).toContain('app.route("/", invites)');
  });
});
