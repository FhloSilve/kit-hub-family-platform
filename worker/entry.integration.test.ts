import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const origin = "https://kit-hub-family-platform.scarletsilverfox.workers.dev";

async function signUp(email: string, name: string) {
  const response = await SELF.fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, name, password: "Correct-Horse-Battery-77!" }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie?.split(";", 1)[0] ?? "";
}

async function apiRequest(path: string, cookie: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", cookie);
  if (!headers.has("origin")) headers.set("origin", origin);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

describe("Worker integration", () => {
  it("reports readiness only after the expected D1 schema is available", async () => {
    const response = await SELF.fetch(`${origin}/api/ready`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      environment: "production",
    });
  });

  it("enforces household tenancy across the Everyday API", async () => {
    const ownerCookie = await signUp("owner-integration@example.com", "Owner Example");
    const otherCookie = await signUp("other-integration@example.com", "Other Example");
    const createResponse = await apiRequest("/api/v1/households", ownerCookie, {
      method: "POST",
      body: JSON.stringify({
        name: "The Test Home",
        timezone: "Europe/Brussels",
        defaultLanguage: "en",
      }),
    });

    expect(createResponse.status).toBe(201);
    const household = await createResponse.json<{ id: string }>();
    expect((await apiRequest(`/api/v1/households/${household.id}/everyday`, ownerCookie)).status).toBe(200);

    const denied = await apiRequest(`/api/v1/households/${household.id}/everyday`, otherCookie);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "HOUSEHOLD_VIEW_REQUIRED" },
    });
  });

  it("requires origin, throttling, and audit for release mutations", async () => {
    const adminCookie = await signUp("admin@example.com", "Admin Example");
    const missingOrigin = await SELF.fetch(`${origin}/api/v1/admin/releases`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: "{}",
    });
    expect(missingOrigin.status).toBe(403);
    await expect(missingOrigin.json()).resolves.toMatchObject({
      error: { code: "TRUSTED_ORIGIN_REQUIRED" },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const unconfigured = await apiRequest("/api/v1/admin/releases", adminCookie, {
        method: "POST",
        body: "{}",
      });
      expect(unconfigured.status).toBe(409);
    }

    const throttled = await apiRequest("/api/v1/admin/releases", adminCookie, {
      method: "POST",
      body: "{}",
    });
    expect(throttled.status).toBe(429);
    await expect(throttled.json()).resolves.toMatchObject({
      error: { code: "ADMIN_RATE_LIMITED" },
    });

    const audit = await env.DB.prepare(
      "SELECT action,result,metadata_json metadata FROM audit_events WHERE actor_user_id=(SELECT id FROM user WHERE email=?) AND action='admin.release.publish' AND result='denied' AND metadata_json LIKE '%rate_limited%' LIMIT 1",
    ).bind("admin@example.com").first<{ action: string; result: string; metadata: string }>();
    expect(audit).toMatchObject({ action: "admin.release.publish", result: "denied" });
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({ reason: "rate_limited" });
  });
});
