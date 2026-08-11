import { Hono, type Context } from "hono";
import coreApp, { HouseholdRealtime } from "./index";
import everydayV2 from "./everyday-v2";
import familyHome from "./family-home";
import meals from "./meals";
import communication from "./communication";
import chatMedia from "./chat-media";
import familyTools from "./family-tools";
import feedback from "./feedback";
import gifSearch from "./gif-search";
import routines from "./routines";
import silvi from "./silvi";
import silviInsights from "./silvi-insights";
import calendarEnhancements from "./calendar-enhancements";
import search from "./search";
import presence from "./presence";
import coordinationActions from "./coordination-actions";
import releaseState from "./release-state";
import { cancelAdminRelease, dispatchAdminRelease, fetchAdminReleaseStatus, requirePlatformAdmin } from "./admin";
import type { AppBindings } from "./http";

export { HouseholdRealtime };
const app = new Hono<AppBindings>();

async function serveAdminShell(c: Context<AppBindings>) {
  const shellResponse = await c.env.ASSETS.fetch(new URL("/", c.req.url).toString());
  if (!shellResponse.ok) return shellResponse;
  const shell = await shellResponse.text();
  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, "<title>Kit Hub Admin</title>")
    .replace(/<meta name="theme-color"[^>]*>/i, '<meta name="theme-color" content="#23262a" id="app-theme-color" />')
    .replace(/<meta name="apple-mobile-web-app-status-bar-style"[^>]*>/i, '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />')
    .replace(/<meta name="apple-mobile-web-app-title"[^>]*>/i, '<meta name="apple-mobile-web-app-title" content="KH Admin" id="apple-app-title" />')
    .replace(/<link rel="manifest"[^>]*>/i, '<link rel="manifest" href="/admin-manifest.webmanifest" id="app-manifest" />')
    .replace(/<link rel="icon"[^>]*>/i, '<link rel="icon" href="/admin-tech-lock.svg" type="image/svg+xml" id="app-favicon" />')
    .replace(/<link rel="apple-touch-icon"[^>]*>/i, '<link rel="apple-touch-icon" href="/admin-tech-lock.svg" id="apple-touch-icon" />')
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, '<meta name="description" content="Administration and production controls for Kit Hub." id="app-description" />');
  const headers = new Headers(shellResponse.headers);headers.set("content-type", "text/html; charset=UTF-8");headers.set("cache-control", "no-store");return new Response(html, { status: 200, headers });
}

app.get("/admin", serveAdminShell);app.get("/admin/", serveAdminShell);
app.get("/api/v1/admin/releases/status", async (c) => { const access = await requirePlatformAdmin(c); if (access.response) return access.response; return c.json(await fetchAdminReleaseStatus(c)); });
app.post("/api/v1/admin/releases", async (c) => { const access = await requirePlatformAdmin(c); if (access.response) return access.response; return dispatchAdminRelease(c); });
app.post("/api/v1/admin/releases/:runId/cancel", async (c) => { const access = await requirePlatformAdmin(c); if (access.response) return access.response; return cancelAdminRelease(c, Number(c.req.param("runId"))); });
app.route("/", releaseState);app.route("/", feedback);app.route("/", familyTools);app.route("/", presence);app.route("/", coordinationActions);app.route("/", gifSearch);app.route("/", chatMedia);app.route("/", communication);app.route("/", familyHome);app.route("/", meals);app.route("/", routines);app.route("/", silviInsights);app.route("/", silvi);app.route("/", calendarEnhancements);app.route("/", search);app.route("/", everydayV2);app.route("/", coreApp);
export default app;
