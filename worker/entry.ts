import { Hono } from "hono";
import coreApp, { HouseholdRealtime } from "./index";
import { cancelAdminRelease, dispatchAdminRelease, fetchAdminReleaseStatus, requirePlatformAdmin } from "./admin";
import type { AppBindings } from "./http";

export { HouseholdRealtime };

const app = new Hono<AppBindings>();

app.get("/api/v1/admin/releases/status", async (c) => {
  const access = await requirePlatformAdmin(c);
  if (access.response) return access.response;
  return c.json(await fetchAdminReleaseStatus(c));
});

app.post("/api/v1/admin/releases", async (c) => {
  const access = await requirePlatformAdmin(c);
  if (access.response) return access.response;
  return dispatchAdminRelease(c);
});

app.post("/api/v1/admin/releases/:runId/cancel", async (c) => {
  const access = await requirePlatformAdmin(c);
  if (access.response) return access.response;
  return cancelAdminRelease(c, Number(c.req.param("runId")));
});

app.route("/", coreApp);

export default app;
