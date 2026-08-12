import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudCog,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  Palette,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import type { AdminPublishPullRequest, AdminReleaseRun, AdminReleaseStatusResponse } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import { AdminFeedbackBoard } from "./AdminFeedbackBoard";
import "../admin.css";
import "../admin-publish.css";

type AdminTheme = "orchid" | "apricot" | "periwinkle" | "ocean";
type StageState = "idle" | "active" | "done" | "failed";

const themes: Array<{ key: AdminTheme; label: string; hex: string }> = [
  { key: "orchid", label: "Orchid", hex: "#F2CFF1" },
  { key: "apricot", label: "Apricot", hex: "#EAB099" },
  { key: "periwinkle", label: "Periwinkle", hex: "#AFAFDA" },
  { key: "ocean", label: "Ocean", hex: "#19485F" },
];

function isSuccessful(run: AdminReleaseRun | null) {
  return Boolean(run?.status === "completed" && run.conclusion === "success");
}

function isFinished(run: AdminReleaseRun | null) {
  return Boolean(run?.status === "completed");
}

function PullRequestSummary({ pull }: { pull: AdminPublishPullRequest }) {
  return <div className={`admin-publish-summary ${pull.ready ? "ready" : "blocked"}`}>
    <div>
      <strong>#{pull.number} · {pull.title}</strong>
      <small>{pull.headBranch} · {pull.headSha.slice(0, 7)} · {pull.checkSummary}</small>
    </div>
    <span>{pull.ready ? <CheckCircle2 /> : <TriangleAlert />}{pull.ready ? "Ready" : "Blocked"}</span>
    {!pull.ready && <ul>{pull.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
    <a href={pull.htmlUrl} target="_blank" rel="noreferrer">Open pull request <ExternalLink /></a>
  </div>;
}

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<AdminReleaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<AdminTheme>(() => (localStorage.getItem("kit-hub-admin-theme") as AdminTheme) || "ocean");
  const [completion, setCompletion] = useState<"success" | "failure" | "cancelled" | null>(null);
  const [waitingForRun, setWaitingForRun] = useState(false);
  const [selectedPullNumber, setSelectedPullNumber] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishState, setPublishState] = useState<StageState>("idle");
  const releaseStart = useRef<{ runId: number | null; requestedAt: number } | null>(null);

  async function refresh() {
    setError(null);
    try {
      const next = await api.adminReleaseStatus();
      setStatus(next);
      setSelectedPullNumber((current) => {
        if (current && next.pullRequests.some((pull) => pull.number === current)) return current;
        return next.pullRequests.find((pull) => pull.ready)?.number ?? next.pullRequests[0]?.number ?? null;
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The release status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { localStorage.setItem("kit-hub-admin-theme", theme); }, [theme]);

  const latestRun = status?.latestRun ?? null;
  const start = releaseStart.current;
  let trackedRun: AdminReleaseRun | null = null;
  if (latestRun && start) {
    const created = latestRun.createdAt ? new Date(latestRun.createdAt).getTime() : 0;
    const isOld = start.runId !== null && latestRun.id === start.runId && waitingForRun;
    if (!isOld && (latestRun.id !== start.runId || created >= start.requestedAt - 15_000)) trackedRun = latestRun;
  }

  useEffect(() => {
    if (!releaseStart.current) return;
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [triggering, waitingForRun, trackedRun?.id, trackedRun?.status]);

  useEffect(() => {
    if (!trackedRun) return;
    setWaitingForRun(false);
    if (!isFinished(trackedRun)) return;
    setCompletion(trackedRun.conclusion === "cancelled" ? "cancelled" : isSuccessful(trackedRun) ? "success" : "failure");
    releaseStart.current = null;
    setStopping(false);
  }, [trackedRun?.id, trackedRun?.status, trackedRun?.conclusion]);

  const selectedPull = status?.pullRequests.find((pull) => pull.number === selectedPullNumber) ?? null;

  async function triggerRelease() {
    setConfirmOpen(false);
    setTriggering(true);
    setPublishState(selectedPull ? "active" : "done");
    setMessage(null);
    setError(null);
    setCompletion(null);
    releaseStart.current = { runId: status?.latestRun?.id ?? null, requestedAt: Date.now() };
    setWaitingForRun(true);
    try {
      const result = await api.triggerAdminRelease(selectedPull ? { pullNumber: selectedPull.number, headSha: selectedPull.headSha } : {});
      setPublishState("done");
      setMessage(result.message);
      window.setTimeout(() => void refresh(), 1_200);
    } catch (caught) {
      releaseStart.current = null;
      setWaitingForRun(false);
      setPublishState(!selectedPull || (caught instanceof ApiError && caught.code === "RELEASE_DISPATCH_AFTER_PUBLISH_FAILED") ? "done" : "failed");
      setError(caught instanceof ApiError ? caught.message : "The release could not be started.");
      setCompletion("failure");
    } finally {
      setTriggering(false);
    }
  }

  async function stopRelease() {
    if (!trackedRun || isFinished(trackedRun)) return;
    setStopping(true);
    setError(null);
    try {
      const result = await api.cancelAdminRelease(trackedRun.id);
      setMessage(result.message);
      window.setTimeout(() => void refresh(), 800);
    } catch (caught) {
      setStopping(false);
      setError(caught instanceof ApiError ? caught.message : "The release could not be stopped.");
      setCompletion("failure");
    }
  }

  function finishCompletion() {
    if (completion === "success") {
      window.location.reload();
      return;
    }
    setCompletion(null);
  }

  const ready = Boolean(status?.releaseConfigured);
  const run = trackedRun ?? status?.latestRun ?? null;
  const releaseActive = Boolean(releaseStart.current) && (!trackedRun || !isFinished(trackedRun));
  const hasOpenPullRequests = Boolean(status?.pullRequests.length);
  const publishStatusUnavailable = status?.publishStatus === "unavailable";
  const canStart = ready && !publishStatusUnavailable && !triggering && !releaseActive && (!hasOpenPullRequests || Boolean(selectedPull?.ready));
  const format = (value?: string | null) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not available";
  const stages = [
    { label: "Publish", hint: selectedPull ? `Merge PR #${selectedPull.number} into main` : "Use current main", stepNames: [] as string[] },
    { label: "Request", hint: "Start protected release", stepNames: [] as string[] },
    { label: "Checks", hint: "Build and quality checks", stepNames: ["run quality checks"] },
    { label: "Database", hint: "Apply D1 migrations", stepNames: ["apply pending d1 migrations"] },
    { label: "Deploy", hint: "Publish the Worker", stepNames: ["deploy production worker"] },
    { label: "Verify", hint: "Confirm live health", stepNames: ["verify production health", "mark verified production release", "verify production release marker"] },
  ];
  const steps = trackedRun?.steps ?? [];

  function rawStageState(index: number): StageState {
    if (index === 0) return publishState;
    if (!releaseStart.current && !trackedRun) return "idle";
    if (index === 1) return trackedRun ? "done" : "active";
    const stage = stages[index];
    if (!stage) return "idle";
    const matching = steps.filter((step) => stage.stepNames.some((name) => step.name.toLowerCase().includes(name)));
    if (matching.some((step) => step.conclusion && !SUCCESSFUL_STEP_CONCLUSIONS.has(step.conclusion))) return "failed";
    if (matching.some((step) => step.status === "in_progress")) return "active";
    if (matching.length && matching.every((step) => step.status === "completed" && SUCCESSFUL_STEP_CONCLUSIONS.has(step.conclusion ?? ""))) return "done";
    if (trackedRun && trackedRun.status !== "completed" && index === 2 && steps.length === 0) return "active";
    return "idle";
  }

  const stageStates: StageState[] = stages.map((_, index) => rawStageState(index));
  for (let index = 1; index < stageStates.length; index += 1) {
    if (stageStates[index - 1] !== "done" && stageStates[index] !== "failed") stageStates[index] = "idle";
  }
  if (trackedRun?.status === "completed" && trackedRun.conclusion === "success") {
    for (let index = 0; index < stageStates.length; index += 1) stageStates[index] = "done";
  }

  return <main className={`admin-page admin-theme-${theme}`}>
    <header className="admin-header">
      <button className="admin-back" onClick={onBack}><ArrowLeft /> Back to Kit Hub</button>
      <div className="admin-title"><span><ShieldCheck /></span><div><small>KIT HUB ADMIN</small><h1>Kit Hub control room</h1><p>GitHub publishing, production releases and tester feedback in one operations space.</p></div></div>
    </header>

    <section className="admin-toolbar">
      <div><Palette /><span><strong>Admin colour</strong><small>Separate this space from the family hub.</small></span></div>
      <div className="admin-themes">{themes.map((item) => <button key={item.key} type="button" className={theme === item.key ? "selected" : ""} onClick={() => setTheme(item.key)}><i style={{ background: item.hex }} />{item.label}{theme === item.key && <Check />}</button>)}</div>
    </section>

    <section className="admin-hero">
      <div><b>PRODUCTION</b><h2>Publish a ready PR, then release <code>main</code>.</h2><p>GitHub merge validation, checks, database migration, Worker deployment and live verification stay together.</p></div>
      <div className={ready ? "admin-health ready" : "admin-health setup"}>{ready ? <CheckCircle2 /> : <TriangleAlert />}<span><strong>{ready ? "GitHub bridge ready" : "One-time setup required"}</strong><small>{ready ? "Publishing and release controls configured" : "Add the GitHub release token secret"}</small></span></div>
    </section>

    {releaseActive && <section className="admin-progress">
      <header><div><LoaderCircle className="spin" /><span><strong>{stopping ? "Stopping production release…" : trackedRun ? "Production release is running" : publishState === "active" ? "Publishing the pull request" : "Waiting for GitHub to start the run"}</strong><small>This page updates automatically.</small></span></div><div className="admin-progress-actions"><b>{trackedRun ? "LIVE" : "STARTING"}</b>{trackedRun && !isFinished(trackedRun) && <button className="admin-stop" onClick={() => void stopRelease()} disabled={stopping}><Square />{stopping ? "Stopping…" : "Stop release"}</button>}</div></header>
      <div className="admin-stage-list">{stages.map((stage, index) => { const state = stageStates[index] ?? "idle"; return <div className={`admin-stage ${state}`} key={stage.label}><span>{state === "done" ? <Check /> : state === "failed" ? <X /> : state === "active" ? <LoaderCircle className="spin" /> : index + 1}</span><div><strong>{stage.label}</strong><small>{stage.hint}</small></div></div>; })}</div>
    </section>}

    {error && <div className="admin-alert error"><TriangleAlert /><span><strong>Couldn&apos;t complete that action</strong><small>{error}</small></span></div>}
    {message && releaseActive && <div className="admin-alert success"><CheckCircle2 /><span><strong>{stopping ? "Cancellation requested" : "Sequence started"}</strong><small>{message}</small></span></div>}

    <div className="admin-grid">
      <section className="admin-card">
        <header><Rocket /><div><small>PRIMARY ACTION</small><h2>Sync + release + verify</h2></div></header>
        <p>{hasOpenPullRequests ? "Choose a ready pull request. Kit Hub will squash-merge its exact checked commit to main, then run and verify the protected production workflow." : "No open pull request targets main. This will release and verify the current main branch."}</p>
        {hasOpenPullRequests && <label className="admin-publish-picker">Pull request<select value={selectedPullNumber ?? ""} onChange={(event) => setSelectedPullNumber(Number(event.target.value))}>{status?.pullRequests.map((pull) => <option key={pull.number} value={pull.number}>#{pull.number} · {pull.title}</option>)}</select></label>}
        {selectedPull && <PullRequestSummary pull={selectedPull} />}
        {status?.publishStatusMessage && <small className={`admin-publish-note ${publishStatusUnavailable ? "blocked" : ""}`}>{status.publishStatusMessage}</small>}
        <button className="admin-primary" onClick={() => setConfirmOpen(true)} disabled={!canStart}>{triggering || releaseActive ? <LoaderCircle className="spin" /> : <Rocket />}{triggering ? "Starting sequence…" : releaseActive ? "Release in progress…" : selectedPull ? `Publish PR #${selectedPull.number} + release` : "Release current main + verify"}</button>
      </section>

      <section className="admin-card"><header><CloudCog /><div><small>LIVE WORKER</small><h2>Current deployment</h2></div></header>{loading ? <p>Loading deployment metadata…</p> : <dl><div><dt>Version</dt><dd>{status?.deployedVersion.id ?? "Unknown"}</dd></div><div><dt>Tag</dt><dd>{status?.deployedVersion.tag ?? "No tag"}</dd></div><div><dt>Deployed</dt><dd>{format(status?.deployedVersion.timestamp)}</dd></div></dl>}</section>

      <section className="admin-card wide"><header><GitBranch /><div><small>GITHUB ACTIONS</small><h2>Latest production release</h2></div><button className="admin-secondary" onClick={() => void refresh()}><RefreshCw />Refresh</button></header>{run ? <div className="admin-run"><strong>{run.status !== "completed" ? "Release in progress" : run.conclusion === "success" ? "Release succeeded" : run.conclusion === "cancelled" ? "Release cancelled" : "Release needs attention"}</strong><small>{run.name} · {run.headBranch} · {format(run.updatedAt)}</small>{run.failure && <div className="admin-failure-summary"><b>Failed: {run.failure.step}</b><span>{run.failure.summary}</span>{run.failure.excerpt && <pre>{run.failure.excerpt}</pre>}</div>}{run.htmlUrl && <a href={run.htmlUrl} target="_blank" rel="noreferrer">Open run <ExternalLink /></a>}</div> : <p>No production release workflow run is available yet.</p>}</section>
    </div>

    <AdminFeedbackBoard />
    <section className="admin-safety"><ShieldCheck /><div><strong>Admin safety boundary</strong><p>Only signed-in, allowlisted platform administrators on the trusted Kit Hub origin can publish. Every request is rate-limited and audited; GitHub branch rules and the production approval gate still apply. No password recheck is required.</p></div></section>

    {confirmOpen && <div className="admin-modal-backdrop"><section className="admin-completion confirm" role="dialog" aria-modal="true" aria-labelledby="admin-release-confirm-title"><button className="admin-modal-close" onClick={() => setConfirmOpen(false)} aria-label="Close"><X /></button><Rocket /><small>SYNC + RELEASE + VERIFY</small><h2 id="admin-release-confirm-title">{selectedPull ? `Publish PR #${selectedPull.number}?` : "Release current main?"}</h2>{selectedPull ? <><p><strong>{selectedPull.title}</strong></p><p>This squash-merges commit <code>{selectedPull.headSha.slice(0, 7)}</code> into <code>main</code>, then starts the protected production workflow.</p></> : <p>This starts the protected workflow for the current <code>main</code> branch. No pull request will be merged.</p>}<p className="admin-confirm-impact">Production may apply D1 migrations and deploy the Worker. GitHub will still require its configured production approval.</p><div className="admin-modal-actions"><button className="admin-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button><button className="admin-primary" onClick={() => void triggerRelease()}>{selectedPull ? "Publish and release" : "Release and verify"}</button></div></section></div>}

    {completion && <div className="admin-modal-backdrop"><section className={`admin-completion ${completion}`} role="dialog" aria-modal="true"><button className="admin-modal-close" onClick={() => setCompletion(null)} aria-label="Close"><X /></button>{completion === "success" ? <CheckCircle2 /> : <TriangleAlert />}<small>PRODUCTION RELEASE</small><h2>{completion === "success" ? "Kit Hub is live and verified" : completion === "cancelled" ? "Release stopped" : "Release needs attention"}</h2>{completion === "failure" && trackedRun?.failure ? <div className="admin-failure-detail"><strong>{trackedRun.failure.step}</strong><p>{trackedRun.failure.summary}</p>{trackedRun.failure.excerpt && <pre>{trackedRun.failure.excerpt}</pre>}</div> : <p>{completion === "success" ? "The pull request was published when selected, checks passed, database work completed, the Worker deployed, and production verification finished successfully." : completion === "cancelled" ? "The active production workflow was cancelled." : error ?? "A release step failed."}</p>}<div className="admin-modal-actions"><button className="admin-primary" onClick={finishCompletion}>Done</button>{run?.htmlUrl && <a className="admin-secondary" href={run.htmlUrl} target="_blank" rel="noreferrer">Open GitHub run <ExternalLink /></a>}</div></section></div>}
  </main>;
}

const SUCCESSFUL_STEP_CONCLUSIONS = new Set(["success", "skipped"]);
