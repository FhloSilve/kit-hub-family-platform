import type { Context } from "hono";
import type { AdminReleaseRun, AdminReleaseStatusResponse, AdminReleaseStep } from "../shared/contracts";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const GITHUB_API = "https://api.github.com";

function adminEmails(env: Env) {
  return (env.KIT_HUB_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}
export function isPlatformAdmin(env: Env, email: string) { return adminEmails(env).includes(email.trim().toLowerCase()); }
export async function requirePlatformAdmin(c: Context<AppBindings>) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue."), session: null };
  if (!isPlatformAdmin(c.env, session.user.email)) return { response: apiError(c, 403, "PLATFORM_ADMIN_REQUIRED", "Kit Hub platform administrator access is required."), session: null };
  return { response: null, session };
}
function releaseConfigured(env: Env) { return Boolean(env.GITHUB_RELEASE_TOKEN && env.GITHUB_REPOSITORY && env.GITHUB_RELEASE_WORKFLOW); }
function githubHeaders(env: Env) { return { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_RELEASE_TOKEN}`, "x-github-api-version": "2022-11-28", "user-agent": "kit-hub-family-platform" }; }
function mapStep(step: Record<string, unknown>): AdminReleaseStep { return { name: typeof step.name === "string" ? step.name : "Release step", status: typeof step.status === "string" ? step.status : "unknown", conclusion: typeof step.conclusion === "string" ? step.conclusion : null, number: typeof step.number === "number" ? step.number : 0 }; }
function mapRun(run: Record<string, unknown>, steps: AdminReleaseStep[] = []): AdminReleaseRun { return { id: Number(run.id), name: typeof run.name === "string" ? run.name : "Production release", status: typeof run.status === "string" ? run.status : "unknown", conclusion: typeof run.conclusion === "string" ? run.conclusion : null, headBranch: typeof run.head_branch === "string" ? run.head_branch : "main", htmlUrl: typeof run.html_url === "string" ? run.html_url : null, createdAt: typeof run.created_at === "string" ? run.created_at : null, updatedAt: typeof run.updated_at === "string" ? run.updated_at : null, steps }; }
async function fetchRunSteps(env: Env, repository: string, runId: number) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/runs/${runId}/jobs?per_page=20`, { headers: githubHeaders(env) });
  if (!response.ok) return [];
  const body = (await response.json()) as { jobs?: Array<{ steps?: Record<string, unknown>[] }> };
  return (body.jobs ?? []).flatMap((job) => job.steps ?? []).map(mapStep).sort((a, b) => a.number - b.number);
}
export async function fetchAdminReleaseStatus(c: Context<AppBindings>): Promise<AdminReleaseStatusResponse> {
  const version = c.env.CF_VERSION_METADATA;
  const base: AdminReleaseStatusResponse = { releaseConfigured: releaseConfigured(c.env), repository: c.env.GITHUB_REPOSITORY ?? null, workflow: c.env.GITHUB_RELEASE_WORKFLOW ?? null, deployedVersion: { id: version.id, tag: version.tag ?? null, timestamp: version.timestamp ?? null }, latestRun: null };
  if (!base.releaseConfigured) return base;
  const repository = c.env.GITHUB_REPOSITORY; const workflow = c.env.GITHUB_RELEASE_WORKFLOW;
  if (!repository || !workflow) return base;
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=main&per_page=1`, { headers: githubHeaders(c.env) });
  if (!response.ok) return base;
  const body = (await response.json()) as { workflow_runs?: Record<string, unknown>[] }; const latest = body.workflow_runs?.[0];
  if (!latest) return base;
  const runId = Number(latest.id); const steps = Number.isFinite(runId) ? await fetchRunSteps(c.env, repository, runId) : [];
  return { ...base, latestRun: mapRun(latest, steps) };
}
export async function dispatchAdminRelease(c: Context<AppBindings>) {
  if (!releaseConfigured(c.env)) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const repository = c.env.GITHUB_REPOSITORY; const workflow = c.env.GITHUB_RELEASE_WORKFLOW;
  if (!repository || !workflow) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: "POST", headers: { ...githubHeaders(c.env), "content-type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { source: "kit-hub-admin" } }) });
  if (!response.ok) return apiError(c, 500, "RELEASE_DISPATCH_FAILED", "GitHub did not accept the production release request.");
  return c.json({ accepted: true, message: "GitHub accepted the release request. Kit Hub will follow it through checks, migration, deploy, and verification." }, 202);
}
export async function cancelAdminRelease(c: Context<AppBindings>, runId: number) {
  if (!releaseConfigured(c.env)) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const repository = c.env.GITHUB_REPOSITORY;
  if (!repository || !Number.isFinite(runId)) return apiError(c, 400, "INVALID_RELEASE_RUN", "A valid release run is required.");
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/runs/${runId}/cancel`, { method: "POST", headers: githubHeaders(c.env) });
  if (!response.ok) return apiError(c, response.status === 409 ? 409 : 500, "RELEASE_CANCEL_FAILED", response.status === 409 ? "This release has already finished and can no longer be stopped." : "GitHub could not stop the production release.");
  return c.json({ cancelled: true, message: "Stop requested. GitHub is cancelling the active production release." }, 202);
}
