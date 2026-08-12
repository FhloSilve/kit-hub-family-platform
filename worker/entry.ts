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
import silviGroceries from "./silvi-groceries";
import silviMeals from "./silvi-meals";
import silviTaskClarifications from "./silvi-task-clarifications";
import silviResponder from "./silvi-responder";
import silviInsights from "./silvi-insights";
import calendarEnhancements from "./calendar-enhancements";
import search from "./search";
import presence from "./presence";
import coordinationActions from "./coordination-actions";
import releaseState from "./release-state";
import productOps, { markBetaTesterActive, privateBetaAccess } from "./product-ops";
import adoptionInsights from "./adoption-insights";
import betaReadiness from "./beta-readiness";
import betaJourney from "./beta-journey";
import securityReadiness from "./security-readiness";
import securityCenter from "./security-center";
import invites from "./invites";
import accountLifecycle from "./account-lifecycle";
import { cancelAdminRelease, dispatchAdminRelease, fetchAdminReleaseStatus, requirePlatformAdmin, type PlatformAdminAction } from "./admin";
import { apiError, type AppBindings } from "./http";
import { applySecurityHeaders, auditAdminMutation, protectAuthRoute, protectHouseholdRoute, protectUnsafeOrigin } from "./security";
import { protectAttachmentUpload } from "./upload-security";

export { HouseholdRealtime };
const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("x-request-id", requestId);
  applySecurityHeaders(c);
});
app.use("*", protectUnsafeOrigin);
app.use("/api/auth/*", protectAuthRoute);

app.use("/api/v1/households/:householdId/*", protectHouseholdRoute);
app.use("/api/v1/households/:householdId/attachments", protectAttachmentUpload);
function adminMutationAction(request: Request): PlatformAdminAction | undefined {
  if (request.method !== "POST") return undefined;
  const path = new URL(request.url).pathname;
  if (path === "/api/v1/admin/releases") return "release.publish";
  if (/^\/api\/v1\/admin\/releases\/[^/]+\/cancel$/.test(path)) return "release.cancel";
  return undefined;
}
app.use("/api/v1/admin/*", async (c, next) => {
  const action = adminMutationAction(c.req.raw);
  const access = await requirePlatformAdmin(c, action);
  if (access.response) return access.response;
  await auditAdminMutation(c, next, action, access.session?.user.id);
});

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

app.get("/admin", serveAdminShell);app.get("/admin/", serveAdminShell);app.get("/admin/launch",serveAdminShell);app.get("/admin/launch/",serveAdminShell);app.get("/admin/feedback",serveAdminShell);app.get("/admin/feedback/",serveAdminShell);
app.get("/api/v1/admin/releases/status", async (c) => c.json(await fetchAdminReleaseStatus(c)));
app.post("/api/v1/admin/releases", async (c) => dispatchAdminRelease(c));
app.post("/api/v1/admin/releases/:runId/cancel", async (c) => cancelAdminRelease(c, Number(c.req.param("runId"))));

app.use("/api/v1/bootstrap", async (c, next) => {
  const beta = await privateBetaAccess(c);
  if (!beta.allowed) return apiError(c, 403, "PRIVATE_BETA_REQUIRED", "Kit Hub is currently in private beta. Ask the platform administrator to add your email to the beta tester list, then sign in again.");
  if (beta.session?.user?.email) await markBetaTesterActive(c, beta.session.user.email);
  await next();
});

app.route("/", releaseState);app.route("/", feedback);app.route("/", familyTools);app.route("/", presence);app.route("/", productOps);app.route("/", betaReadiness);app.route("/", betaJourney);app.route("/", securityReadiness);app.route("/", securityCenter);app.route("/", accountLifecycle);app.route("/", invites);app.route("/", adoptionInsights);app.route("/", coordinationActions);app.route("/", gifSearch);app.route("/", chatMedia);app.route("/", communication);app.route("/", familyHome);app.route("/", meals);app.route("/", routines);app.route("/", silviInsights);app.route("/", silviTaskClarifications);app.route("/", silviMeals);app.route("/", silviGroceries);app.route("/", silviResponder);app.route("/", silvi);app.route("/", calendarEnhancements);app.route("/", search);app.route("/", everydayV2);app.route("/", coreApp);
export default app;
