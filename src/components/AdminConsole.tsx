import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, CloudCog, ExternalLink, GitBranch, LoaderCircle, Palette, RefreshCw, Rocket, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { AdminReleaseRun, AdminReleaseStatusResponse } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import "../admin.css";

type AdminTheme = "orchid" | "apricot" | "periwinkle" | "ocean";
const themes: Array<{ key: AdminTheme; label: string; hex: string }> = [
  { key: "orchid", label: "Orchid", hex: "#F2CFF1" },
  { key: "apricot", label: "Apricot", hex: "#EAB099" },
  { key: "periwinkle", label: "Periwinkle", hex: "#AFAFDA" },
  { key: "ocean", label: "Ocean", hex: "#19485F" },
];

function isSuccessful(run: AdminReleaseRun | null) { return Boolean(run?.status === "completed" && run.conclusion === "success"); }
function isFinished(run: AdminReleaseRun | null) { return Boolean(run?.status === "completed"); }

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<AdminReleaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<AdminTheme>(() => (localStorage.getItem("kit-hub-admin-theme") as AdminTheme) || "ocean");
  const [completion, setCompletion] = useState<"success" | "failure" | null>(null);
  const [waitingForRun, setWaitingForRun] = useState(false);
  const releaseStart = useRef<{ runId: number | null; requestedAt: number } | null>(null);

  async function refresh() {
    setError(null);
    try { setStatus(await api.adminReleaseStatus()); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The release status could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { localStorage.setItem("kit-hub-admin-theme", theme); }, [theme]);

  const trackedRun = useMemo(() => {
    const run = status?.latestRun ?? null;
    const start = releaseStart.current;
    if (!run || !start) return null;
    if (start.runId !== null && run.id === start.runId && waitingForRun) return null;
    const created = run.createdAt ? new Date(run.createdAt).getTime() : 0;
    return run.id !== start.runId || created >= start.requestedAt - 15000 ? run : null;
  }, [status?.latestRun?.id, status?.latestRun?.status, status?.latestRun?.conclusion, waitingForRun]);

  useEffect(() => {
    if (!releaseStart.current) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [triggering, waitingForRun, trackedRun?.id, trackedRun?.status]);

  useEffect(() => {
    if (!trackedRun) return;
    setWaitingForRun(false);
    if (!isFinished(trackedRun)) return;
    setCompletion(isSuccessful(trackedRun) ? "success" : "failure");
    releaseStart.current = null;
  }, [trackedRun?.id, trackedRun?.status, trackedRun?.conclusion]);

  async function triggerRelease() {
    setTriggering(true); setMessage(null); setError(null); setCompletion(null);
    releaseStart.current = { runId: status?.latestRun?.id ?? null, requestedAt: Date.now() };
    setWaitingForRun(true);
    try {
      const result = await api.triggerAdminRelease();
      setMessage(result.message);
      window.setTimeout(() => void refresh(), 1200);
    } catch (e) {
      releaseStart.current = null; setWaitingForRun(false);
      setError(e instanceof ApiError ? e.message : "The release could not be started.");
    } finally { setTriggering(false); }
  }

  const ready = Boolean(status?.releaseConfigured);
  const run = trackedRun ?? status?.latestRun ?? null;
  const releaseActive = Boolean(releaseStart.current) && (!trackedRun || !isFinished(trackedRun));
  const format = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available";

  const stages = [
    { label: "Request", hint: "Send release to GitHub", match: ["checkout", "prepare"] },
    { label: "Checks", hint: "Build and quality checks", match: ["check", "test", "type", "lint", "build"] },
    { label: "Database", hint: "Apply D1 migrations", match: ["migration", "migrate", "d1"] },
    { label: "Deploy", hint: "Publish the Worker", match: ["deploy", "wrangler"] },
    { label: "Verify", hint: "Confirm live health", match: ["verify", "health"] },
  ];
  const steps = trackedRun?.steps ?? [];
  function stageState(index: number) {
    if (!releaseStart.current && !trackedRun) return "idle";
    if (index === 0) return trackedRun ? "done" : "active";
    const stage = stages[index];
    const matching = steps.filter((step) => stage.match.some((term) => step.name.toLowerCase().includes(term)));
    if (matching.some((step) => step.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped")) return "failed";
    if (matching.some((step) => step.status === "in_progress")) return "active";
    if (matching.length && matching.every((step) => step.status === "completed")) return "done";
    if (trackedRun?.status === "completed" && trackedRun.conclusion === "success") return "done";
    return "idle";
  }

  return <main className={`admin-page admin-theme-${theme}`}>
    <header className="admin-header"><button className="admin-back" onClick={onBack}><ArrowLeft /> Back to Kit Hub</button><div className="admin-title"><span><ShieldCheck /></span><div><small>KIT HUB ADMIN</small><h1>Release control room</h1><p>A separate operations space for Kit Hub itself.</p></div></div></header>

    <section className="admin-toolbar"><div><Palette /><span><strong>Admin colour</strong><small>Separate this space from the family hub.</small></span></div><div className="admin-themes">{themes.map((item) => <button key={item.key} type="button" className={theme === item.key ? "selected" : ""} onClick={() => setTheme(item.key)} title={`${item.label} ${item.hex}`}><i style={{ background: item.hex }} />{item.label}{theme === item.key && <Check />}</button>)}</div></section>

    <section className="admin-hero"><div><b>PRODUCTION</b><h2>Release <code>main</code> with every step visible.</h2><p>Kit Hub follows the protected GitHub workflow from request through checks, D1 migration, Worker deployment, and live verification.</p></div><div className={ready ? "admin-health ready" : "admin-health setup"}>{ready ? <CheckCircle2 /> : <TriangleAlert />}<span><strong>{ready ? "Release bridge ready" : "One-time setup required"}</strong><small>{ready ? "Server-side GitHub trigger configured" : "Add the GitHub release token secret"}</small></span></div></section>

    {releaseActive && <section className="admin-progress"><header><div><LoaderCircle className="spin" /><span><strong>{trackedRun ? "Production release is running" : "Waiting for GitHub to start the run"}</strong><small>This page updates automatically. You can keep it open.</small></span></div><b>{trackedRun ? "LIVE" : "STARTING"}</b></header><div className="admin-stage-list">{stages.map((stage, index) => { const state = stageState(index); return <div className={`admin-stage ${state}`} key={stage.label}><span>{state === "done" ? <Check /> : state === "failed" ? <X /> : state === "active" ? <LoaderCircle className="spin" /> : index + 1}</span><div><strong>{stage.label}</strong><small>{stage.hint}</small></div></div>; })}</div></section>}

    {error && <div className="admin-alert error"><TriangleAlert /> <span><strong>Couldn&apos;t complete that action</strong><small>{error}</small></span></div>}{message && releaseActive && <div className="admin-alert success"><CheckCircle2 /> <span><strong>Release requested</strong><small>{message}</small></span></div>}

    <div className="admin-grid"><section className="admin-card"><header><Rocket /><div><small>PRIMARY ACTION</small><h2>Sync + release + verify</h2></div></header><p>Runs the protected production workflow and follows it until the final result.</p><button className="admin-primary" onClick={() => void triggerRelease()} disabled={!ready || triggering || releaseActive}>{triggering || releaseActive ? <LoaderCircle className="spin" /> : <Rocket />}{triggering ? "Starting release…" : releaseActive ? "Release in progress…" : "Sync + release + verify"}</button></section>
    <section className="admin-card"><header><CloudCog /><div><small>LIVE WORKER</small><h2>Current deployment</h2></div></header>{loading ? <p>Loading deployment metadata…</p> : <dl><div><dt>Version</dt><dd>{status?.deployedVersion.id ?? "Unknown"}</dd></div><div><dt>Tag</dt><dd>{status?.deployedVersion.tag ?? "No tag"}</dd></div><div><dt>Deployed</dt><dd>{format(status?.deployedVersion.timestamp)}</dd></div></dl>}</section>
    <section className="admin-card wide"><header><GitBranch /><div><small>GITHUB ACTIONS</small><h2>Latest production release</h2></div><button className="admin-secondary" onClick={() => void refresh()}><RefreshCw /> Refresh</button></header>{run ? <div className="admin-run"><strong>{run.status !== "completed" ? "Release in progress" : run.conclusion === "success" ? "Release succeeded" : "Release needs attention"}</strong><small>{run.name} · {run.headBranch} · {format(run.updatedAt)}</small>{run.htmlUrl && <a href={run.htmlUrl} target="_blank" rel="noreferrer">Open run <ExternalLink /></a>}</div> : <p>No production release workflow run is available yet.</p>}</section></div>
    <section className="admin-safety"><ShieldCheck /><div><strong>Admin safety boundary</strong><p>Only server-side allowlisted platform administrators can use these release endpoints.</p></div></section>

    {completion && <div className="admin-modal-backdrop" role="presentation"><section className={`admin-completion ${completion}`} role="dialog" aria-modal="true" aria-labelledby="release-complete-title"><button className="admin-modal-close" onClick={() => setCompletion(null)} aria-label="Close"><X /></button>{completion === "success" ? <CheckCircle2 /> : <TriangleAlert />}<small>PRODUCTION RELEASE</small><h2 id="release-complete-title">{completion === "success" ? "Kit Hub is live and verified" : "Release needs attention"}</h2><p>{completion === "success" ? "Checks passed, database work completed, the Worker deployed, and the production workflow finished successfully." : "The production workflow finished with a problem. Open the GitHub run to see the failing step."}</p><div className="admin-modal-actions"><button className="admin-primary" onClick={() => setCompletion(null)}>Done</button>{run?.htmlUrl && <a className="admin-secondary" href={run.htmlUrl} target="_blank" rel="noreferrer">Open GitHub run <ExternalLink /></a>}</div></section></div>}
  </main>;
}
