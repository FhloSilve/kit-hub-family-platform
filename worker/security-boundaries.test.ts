import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

describe("private beta security boundaries",()=>{
  it("puts every household API behind the global membership guard",()=>{
    const entry=read("worker/entry.ts");
    expect(entry).toContain('app.use("/api/v1/households/:householdId/*", protectHouseholdRoute)');
    const security=read("worker/security.ts");
    expect(security).toContain("memberships WHERE household_id=? AND user_id=? AND status='active'");
    expect(security).toContain("AUTH_REQUIRED");
    expect(security).toContain("HOUSEHOLD_VIEW_REQUIRED");
  });

  it("keeps Silvi changes behind explicit, scoped confirmation",()=>{
    const silvi=read("worker/silvi.ts");
    expect(silvi).toContain('body?.confirm !== true');
    expect(silvi).toContain('"CONFIRMATION_REQUIRED"');
    expect(silvi).toContain("WHERE id=? AND household_id=? AND user_id=?");
    expect(silvi).toContain("status='pending'");
    expect(silvi).toContain("SET status='executing'");
    expect(silvi).toContain("const action = await normalizeAction");
    expect(silvi).toContain("const applied = await executeAction");
  });

  it("rate limits household mutations and the Silvi boundary",()=>{
    const security=read("worker/security.ts");
    expect(security).toContain('key: "silvi-ask"');
    expect(security).toContain('key: "silvi-action"');
    expect(security).toContain('key: "household-write"');
    expect(security).toContain("api_security_rate_limits");
  });

  it("keeps successful household edits from silently leaving stale screens",()=>{
    const refresh=read("src/components/HouseholdDataRefreshBridge.tsx");
    expect(refresh).toContain("response.ok");
    expect(refresh).toContain("kit-hub-household-data-changed");
    expect(refresh).toContain("successful-api-mutation");
  });
});
