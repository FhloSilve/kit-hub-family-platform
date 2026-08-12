import type { Context } from "hono";
import type {
  AdminPublishPullRequest,
  AdminReleaseDispatchInput,
  AdminReleaseFailure,
  AdminReleaseRun,
  AdminReleaseStatusResponse,
  AdminReleaseStep,
} from "../shared/contracts";
import { createAuth, resolveAuthOrigins } from "./auth";
import { apiError, type AppBindings } from "./http";
import { auditSecurityEvent, protectAdminMutationRateLimit } from "./security";

const GITHUB_API = "https://api.github.com";
const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

export type PlatformAdminAction = "release.publish" | "release.cancel";

type GitHubCheckRun = { status?: string; conclusion?: string | null };
type GitHubPullRequest = {
  number?: number;
  node_id?: string;
  title?: string;
  state?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  merge_commit_sha?: string | null;
  html_url?: string;
  updated_at?: string;
  user?: { login?: string } | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
};

function adminEmails(env: Env) {
  return (env.KIT_HUB_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdmin(env: Env, email: string) {
  return adminEmails(env).includes(email.trim().toLowerCase());
}

export function isTrustedAdminOrigin(request: Request, configuredAuthURL: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === resolveAuthOrigins(request, configuredAuthURL).authOrigin;
  } catch {
    return false;
  }
}

async function denyAdminMutation(c: Context<AppBindings>, userId: string, action: PlatformAdminAction, reason: string) {
  await auditSecurityEvent(c, {
    userId,
    action: `admin.${action}`,
    resourceType: "production_release",
    result: "denied",
    metadata: { reason },
  });
}

export async function requirePlatformAdmin(c: Context<AppBindings>, mutationAction?: PlatformAdminAction) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue."), session: null };
  if (!isPlatformAdmin(c.env, session.user.email)) {
    if (mutationAction) await denyAdminMutation(c, session.user.id, mutationAction, "platform_admin_required");
    return { response: apiError(c, 403, "PLATFORM_ADMIN_REQUIRED", "Kit Hub platform administrator access is required."), session: null };
  }
  if (mutationAction) {
    if (!isTrustedAdminOrigin(c.req.raw, c.env.BETTER_AUTH_URL)) {
      await denyAdminMutation(c, session.user.id, mutationAction, "trusted_origin_required");
      return { response: apiError(c, 403, "TRUSTED_ORIGIN_REQUIRED", "Production releases can only be controlled from the Kit Hub admin application."), session: null };
    }
    const rateLimited = await protectAdminMutationRateLimit(c, session.user.id, mutationAction);
    if (rateLimited) {
      await denyAdminMutation(c, session.user.id, mutationAction, "rate_limited");
      return { response: rateLimited, session: null };
    }
  }
  return { response: null, session };
}

function releaseConfigured(env: Env) {
  return Boolean(env.GITHUB_RELEASE_TOKEN && env.GITHUB_REPOSITORY && env.GITHUB_RELEASE_WORKFLOW);
}

function githubHeaders(env: Env) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_RELEASE_TOKEN}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "kit-hub-family-platform",
  };
}

function mapStep(step: Record<string, unknown>): AdminReleaseStep {
  return {
    name: typeof step.name === "string" ? step.name : "Release step",
    status: typeof step.status === "string" ? step.status : "unknown",
    conclusion: typeof step.conclusion === "string" ? step.conclusion : null,
    number: typeof step.number === "number" ? step.number : 0,
  };
}

function mapRun(run: Record<string, unknown>, steps: AdminReleaseStep[] = [], failure: AdminReleaseFailure | null = null): AdminReleaseRun {
  return {
    id: Number(run.id),
    name: typeof run.name === "string" ? run.name : "Production release",
    status: typeof run.status === "string" ? run.status : "unknown",
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    headBranch: typeof run.head_branch === "string" ? run.head_branch : "main",
    htmlUrl: typeof run.html_url === "string" ? run.html_url : null,
    createdAt: typeof run.created_at === "string" ? run.created_at : null,
    updatedAt: typeof run.updated_at === "string" ? run.updated_at : null,
    steps,
    failure,
  };
}

async function fetchRunDetails(env: Env, repository: string, runId: number) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/runs/${runId}/jobs?per_page=20`, { headers: githubHeaders(env) });
  if (!response.ok) return { steps: [] as AdminReleaseStep[], failure: null as AdminReleaseFailure | null };
  const body = (await response.json()) as { jobs?: Array<{ id?: number; name?: string; conclusion?: string | null; steps?: Record<string, unknown>[] }> };
  const jobs = body.jobs ?? [];
  const steps = jobs.flatMap((job) => job.steps ?? []).map(mapStep).sort((a, b) => a.number - b.number);
  const failedJob = jobs.find((job) => job.conclusion && !["success", "skipped", "cancelled"].includes(job.conclusion));
  const failedStep = steps.find((step) => step.conclusion && !["success", "skipped", "cancelled"].includes(step.conclusion));
  if (!failedJob && !failedStep) return { steps, failure: null };
  let excerpt: string | null = null;
  if (failedJob?.id) {
    const logResponse = await fetch(`${GITHUB_API}/repos/${repository}/actions/jobs/${failedJob.id}/logs`, { headers: githubHeaders(env), redirect: "follow" });
    if (logResponse.ok) {
      const text = await logResponse.text();
      const lines = text.split(/\r?\n/).map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[^ ]+\s*/, "").trim()).filter(Boolean);
      const interesting = lines.filter((line) => /(^|\s)(error|failed|failure|fatal|exception|TS\d{4}|npm ERR!)(:|\s|$)/i.test(line));
      excerpt = (interesting.length ? interesting.slice(-6) : lines.slice(-6)).join("\n").slice(0, 1800) || null;
    }
  }
  return {
    steps,
    failure: {
      step: failedStep?.name ?? failedJob?.name ?? "Production release",
      summary: `${failedStep?.name ?? failedJob?.name ?? "A release step"} failed in GitHub Actions.`,
      excerpt,
    },
  };
}

export function evaluatePullRequestReadiness(input: {
  draft: boolean;
  baseBranch: string;
  mergeable: boolean | null;
  checks: GitHubCheckRun[];
}) {
  const blockers: string[] = [];
  if (input.baseBranch !== "main") blockers.push("The pull request must target main.");
  if (input.mergeable === null) blockers.push("GitHub is still calculating whether this pull request can merge.");
  if (input.mergeable === false) blockers.push("Resolve the pull request's merge conflict first.");

  let checkState: AdminPublishPullRequest["checkState"] = "success";
  let checkSummary = "All checks passed.";
  if (input.checks.length === 0) {
    checkState = "missing";
    checkSummary = "No CI checks were found for the latest commit.";
    blockers.push(checkSummary);
  } else if (input.checks.some((check) => check.status !== "completed")) {
    checkState = "pending";
    checkSummary = "CI checks are still running.";
    blockers.push(checkSummary);
  } else if (input.checks.some((check) => !check.conclusion || !SUCCESSFUL_CHECK_CONCLUSIONS.has(check.conclusion))) {
    checkState = "failure";
    checkSummary = "One or more CI checks did not pass.";
    blockers.push(checkSummary);
  } else {
    checkSummary = `${input.checks.length} CI check${input.checks.length === 1 ? "" : "s"} passed.`;
  }

  return { ready: blockers.length === 0, blockers, checkState, checkSummary };
}

export async function markPullRequestReadyForReview(env: Env, pull: GitHubPullRequest) {
  const pullRequestId = pull.node_id?.trim();
  if (!pullRequestId) return false;
  const response = await fetch(`${GITHUB_API}/graphql`, {
    method: "POST",
    headers: { ...githubHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({
      query: "mutation MarkPullRequestReady($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { isDraft } } }",
      variables: { pullRequestId },
    }),
  });
  if (!response.ok) return false;
  const body = (await response.json().catch(() => ({}))) as {
    data?: { markPullRequestReadyForReview?: { pullRequest?: { isDraft?: boolean } } };
    errors?: Array<{ message?: string }>;
  };
  return !body.errors?.length && body.data?.markPullRequestReadyForReview?.pullRequest?.isDraft === false;
}

async function fetchCheckRuns(env: Env, repository: string, sha: string) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}/commits/${encodeURIComponent(sha)}/check-runs?filter=latest&per_page=100`, { headers: githubHeaders(env) });
  if (!response.ok) return null;
  const body = (await response.json()) as { check_runs?: GitHubCheckRun[] };
  return body.check_runs ?? [];
}

async function fetchPullRequestChecks(env: Env, repository: string, pull: GitHubPullRequest) {
  const refs = [...new Set([pull.merge_commit_sha, pull.head?.sha].filter((value): value is string => Boolean(value)))];
  let reachedGitHub = false;
  for (const ref of refs) {
    const checks = await fetchCheckRuns(env, repository, ref);
    if (checks === null) continue;
    reachedGitHub = true;
    if (checks.length > 0) return checks;
  }
  return reachedGitHub ? [] : null;
}

async function mapPullRequest(env: Env, repository: string, pull: GitHubPullRequest): Promise<AdminPublishPullRequest | null> {
  const number = Number(pull.number);
  if (!Number.isInteger(number) || number < 1) return null;
  const detailResponse = await fetch(`${GITHUB_API}/repos/${repository}/pulls/${number}`, { headers: githubHeaders(env) });
  if (!detailResponse.ok) return null;
  const detail = (await detailResponse.json()) as GitHubPullRequest;
  const headSha = detail.head?.sha ?? "";
  const checks = headSha ? await fetchPullRequestChecks(env, repository, detail) : null;
  if (!headSha || checks === null) return null;
  const baseBranch = detail.base?.ref ?? "";
  const readiness = evaluatePullRequestReadiness({
    draft: Boolean(detail.draft),
    baseBranch,
    mergeable: typeof detail.mergeable === "boolean" ? detail.mergeable : null,
    checks,
  });
  return {
    number,
    title: detail.title?.trim() || `Pull request #${number}`,
    headBranch: detail.head?.ref ?? "unknown",
    headSha,
    baseBranch,
    htmlUrl: detail.html_url ?? `https://github.com/${repository}/pull/${number}`,
    author: detail.user?.login ?? null,
    updatedAt: detail.updated_at ?? null,
    draft: Boolean(detail.draft),
    mergeable: typeof detail.mergeable === "boolean" ? detail.mergeable : null,
    ...readiness,
  };
}

async function fetchOpenPullRequests(env: Env, repository: string) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}/pulls?state=open&base=main&sort=updated&direction=desc&per_page=5`, { headers: githubHeaders(env) });
  if (!response.ok) return { pullRequests: [] as AdminPublishPullRequest[], publishStatus: "unavailable" as const, publishStatusMessage: "GitHub pull request status is temporarily unavailable." };
  const listed = (await response.json()) as GitHubPullRequest[];
  if (listed.length === 0) return { pullRequests: [] as AdminPublishPullRequest[], publishStatus: "no_changes" as const, publishStatusMessage: "No open pull request targets main." };
  const mapped = await Promise.all(listed.map((pull) => mapPullRequest(env, repository, pull)));
  const pullRequests = mapped.filter((pull): pull is AdminPublishPullRequest => Boolean(pull));
  if (pullRequests.length !== listed.length) {
    return { pullRequests, publishStatus: "unavailable" as const, publishStatusMessage: "GitHub pull-request details or CI checks could not be verified. Publishing is disabled until the token can read them." };
  }
  return { pullRequests, publishStatus: "available" as const, publishStatusMessage: null };
}

async function fetchLatestRun(env: Env, repository: string, workflow: string) {
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=main&per_page=1`, { headers: githubHeaders(env) });
  if (!response.ok) return null;
  const body = (await response.json()) as { workflow_runs?: Record<string, unknown>[] };
  const latest = body.workflow_runs?.[0];
  if (!latest) return null;
  const runId = Number(latest.id);
  const details = Number.isFinite(runId) ? await fetchRunDetails(env, repository, runId) : { steps: [], failure: null };
  return mapRun(latest, details.steps, details.failure);
}

export async function fetchAdminReleaseStatus(c: Context<AppBindings>): Promise<AdminReleaseStatusResponse> {
  const version = c.env.CF_VERSION_METADATA;
  const configured = releaseConfigured(c.env);
  const base: AdminReleaseStatusResponse = {
    releaseConfigured: configured,
    publishConfigured: configured,
    publishStatus: configured ? "no_changes" : "unavailable",
    repository: c.env.GITHUB_REPOSITORY ?? null,
    workflow: c.env.GITHUB_RELEASE_WORKFLOW ?? null,
    deployedVersion: { id: version.id, tag: version.tag ?? null, timestamp: version.timestamp ?? null },
    latestRun: null,
    pullRequests: [],
    publishStatusMessage: configured ? null : "Add the server-side GitHub release token before publishing from Kit Hub.",
  };
  if (!configured) return base;
  const repository = c.env.GITHUB_REPOSITORY;
  const workflow = c.env.GITHUB_RELEASE_WORKFLOW;
  if (!repository || !workflow) return base;
  const [latestRun, publishStatus] = await Promise.all([
    fetchLatestRun(c.env, repository, workflow),
    fetchOpenPullRequests(c.env, repository),
  ]);
  return { ...base, latestRun, ...publishStatus };
}

async function publishPullRequest(c: Context<AppBindings>, repository: string, input: AdminReleaseDispatchInput) {
  const pullNumber = Number(input.pullNumber);
  const expectedHeadSha = typeof input.headSha === "string" ? input.headSha.trim() : "";
  if (!Number.isInteger(pullNumber) || pullNumber < 1 || !/^[a-f0-9]{40}$/i.test(expectedHeadSha)) {
    return { response: apiError(c, 422, "INVALID_PUBLISH_REQUEST", "Choose a valid GitHub pull request to publish."), published: null };
  }

  const pullResponse = await fetch(`${GITHUB_API}/repos/${repository}/pulls/${pullNumber}`, { headers: githubHeaders(c.env) });
  if (!pullResponse.ok) return { response: apiError(c, 409, "PUBLISH_NOT_READY", "GitHub could not find that open pull request."), published: null };
  const pull = (await pullResponse.json()) as GitHubPullRequest;
  const currentHeadSha = pull.head?.sha ?? "";
  if (pull.state !== "open" || currentHeadSha !== expectedHeadSha) {
    return { response: apiError(c, 409, "PUBLISH_HEAD_CHANGED", "The pull request changed after it was selected. Refresh and review the latest commit before publishing."), published: null };
  }
  const checks = await fetchPullRequestChecks(c.env, repository, pull);
  if (checks === null) return { response: apiError(c, 500, "PUBLISH_CHECKS_UNAVAILABLE", "GitHub checks could not be verified. Nothing was published."), published: null };
  const readiness = evaluatePullRequestReadiness({
    draft: Boolean(pull.draft),
    baseBranch: pull.base?.ref ?? "",
    mergeable: typeof pull.mergeable === "boolean" ? pull.mergeable : null,
    checks,
  });
  if (!readiness.ready) {
    return { response: apiError(c, 409, "PUBLISH_NOT_READY", readiness.blockers[0] ?? "The pull request is not ready to publish."), published: null };
  }
  if (pull.draft && !(await markPullRequestReadyForReview(c.env, pull))) {
    return {
      response: apiError(c, 500, "PUBLISH_READY_FAILED", "GitHub could not mark this draft ready for review. The release token needs Pull requests: write permission. Nothing was merged or released."),
      published: null,
    };
  }

  const mergeResponse = await fetch(`${GITHUB_API}/repos/${repository}/pulls/${pullNumber}/merge`, {
    method: "PUT",
    headers: { ...githubHeaders(c.env), "content-type": "application/json" },
    body: JSON.stringify({
      sha: currentHeadSha,
      merge_method: "squash",
      commit_title: `${pull.title?.trim() || `Publish pull request #${pullNumber}`} (#${pullNumber})`,
      commit_message: "Published through the Kit Hub admin release sequence.",
    }),
  });
  const mergeBody = (await mergeResponse.json().catch(() => ({}))) as { merged?: boolean; sha?: string; message?: string };
  if (!mergeResponse.ok || !mergeBody.merged || !mergeBody.sha) {
    const message = mergeResponse.status === 403
      ? "The GitHub release token needs Contents: write permission before Kit Hub can publish pull requests."
      : mergeResponse.status === 409
        ? "The pull request changed while publishing. Refresh and try again."
        : "GitHub did not allow this pull request to merge. Check its branch protection and merge status.";
    return { response: apiError(c, mergeResponse.status === 409 ? 409 : 500, "PUBLISH_MERGE_FAILED", message), published: null };
  }
  return { response: null, published: { pullNumber, sha: mergeBody.sha } };
}

export async function dispatchAdminRelease(c: Context<AppBindings>) {
  if (!releaseConfigured(c.env)) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const repository = c.env.GITHUB_REPOSITORY;
  const workflow = c.env.GITHUB_RELEASE_WORKFLOW;
  if (!repository || !workflow) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const input = (await c.req.json().catch(() => ({}))) as AdminReleaseDispatchInput;
  const wantsPublish = input.pullNumber !== undefined || input.headSha !== undefined;
  const publishResult = wantsPublish ? await publishPullRequest(c, repository, input) : { response: null, published: null };
  if (publishResult.response) return publishResult.response;

  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: "POST",
    headers: { ...githubHeaders(c.env), "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { source: publishResult.published ? "kit-hub-admin-publish" : "kit-hub-admin" } }),
  });
  if (!response.ok) {
    return apiError(
      c,
      500,
      publishResult.published ? "RELEASE_DISPATCH_AFTER_PUBLISH_FAILED" : "RELEASE_DISPATCH_FAILED",
      publishResult.published
        ? `Pull request #${publishResult.published.pullNumber} was published, but GitHub did not start the production workflow. Retry the release without selecting a pull request.`
        : "GitHub did not accept the production release request.",
    );
  }
  return c.json({
    accepted: true,
    published: publishResult.published,
    message: publishResult.published
      ? `Pull request #${publishResult.published.pullNumber} was published to main. GitHub accepted the protected production release request.`
      : "GitHub accepted the release request for the current main branch.",
  }, 202);
}

export async function cancelAdminRelease(c: Context<AppBindings>, runId: number) {
  if (!releaseConfigured(c.env)) return apiError(c, 409, "RELEASE_NOT_CONFIGURED", "The server-side GitHub release bridge has not been configured yet.");
  const repository = c.env.GITHUB_REPOSITORY;
  if (!repository || !Number.isFinite(runId)) return apiError(c, 400, "INVALID_RELEASE_RUN", "A valid release run is required.");
  const response = await fetch(`${GITHUB_API}/repos/${repository}/actions/runs/${runId}/cancel`, { method: "POST", headers: githubHeaders(c.env) });
  if (!response.ok) return apiError(c, response.status === 409 ? 409 : 500, "RELEASE_CANCEL_FAILED", response.status === 409 ? "This release has already finished and can no longer be stopped." : "GitHub could not stop the production release.");
  return c.json({ cancelled: true, message: "Stop requested. GitHub is cancelling the active production release." }, 202);
}
