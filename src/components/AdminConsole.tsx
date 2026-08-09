import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudCog, ExternalLink, GitBranch, LoaderCircle, RefreshCw, Rocket, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AdminReleaseStatusResponse } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import "../admin.css";

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<AdminReleaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() { setError(null); try { setStatus(await api.adminReleaseStatus()); } catch (e) { setError(e instanceof ApiError ? e.message : "The release status could not be loaded."); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!status?.latestRun || status.latestRun.status === "completed") return; const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [status?.latestRun?.id, status?.latestRun?.status]);
  async function triggerRelease() { setTriggering(true); setMessage(null); setError(null); try { const result = await api.triggerAdminRelease(); setMessage(result.message); window.setTimeout(() => void refresh(), 1500); } catch (e) { setError(e instanceof ApiError ? e.message : "The release could not be started."); } finally { setTriggering(false); } }
  const ready = Boolean(status?.releaseConfigured); const run = status?.latestRun ?? null; const running = Boolean(run && run.status !== "completed");
  const format = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available";
  return <main className="admin-page">
    <header className="admin-header"><button className="admin-back" onClick={onBack}><ArrowLeft /> Back to Kit Hub</button><div className="admin-title"><span><ShieldCheck /></span><div><small>KIT HUB ADMIN</small><h1>Release control room</h1><p>Platform operations stay separate from household administration.</p></div></div></header>
    <section className="admin-hero"><div><b>PRODUCTION</b><h2>Sync the latest <code>main</code> and release it safely.</h2><p>GitHub Actions runs checks, applies pending D1 migrations, deploys the Worker, and verifies the live health endpoint. Deployment credentials never enter the browser.</p></div><div className={ready ? "admin-health ready" : "admin-health setup"}>{ready ? <CheckCircle2 /> : <TriangleAlert />}<span><strong>{ready ? "Release bridge ready" : "One-time setup required"}</strong><small>{ready ? "Server-side GitHub trigger configured" : "Add the GitHub release token secret"}</small></span></div></section>
    {error && <div className="admin-alert error"><TriangleAlert /> <span><strong>Couldn&apos;t complete that action</strong><small>{error}</small></span></div>}{message && <div className="admin-alert success"><CheckCircle2 /> <span><strong>Release requested</strong><small>{message}</small></span></div>}
    <div className="admin-grid"><section className="admin-card"><header><Rocket /><div><small>PRIMARY ACTION</small><h2>Sync + release + verify</h2></div></header><p>Runs the protected production workflow from GitHub.</p><button className="admin-primary" onClick={() => void triggerRelease()} disabled={!ready || triggering || running}>{triggering || running ? <LoaderCircle className="spin" /> : <Rocket />}{triggering ? "Starting release…" : running ? "Release running…" : "Sync + release + verify"}</button></section>
    <section className="admin-card"><header><CloudCog /><div><small>LIVE WORKER</small><h2>Current deployment</h2></div></header>{loading ? <p>Loading deployment metadata…</p> : <dl><div><dt>Version</dt><dd>{status?.deployedVersion.id ?? "Unknown"}</dd></div><div><dt>Tag</dt><dd>{status?.deployedVersion.tag ?? "No tag"}</dd></div><div><dt>Deployed</dt><dd>{format(status?.deployedVersion.timestamp)}</dd></div></dl>}</section>
    <section className="admin-card wide"><header><GitBranch /><div><small>GITHUB ACTIONS</small><h2>Latest production release</h2></div><button className="admin-secondary" onClick={() => void refresh()}><RefreshCw /> Refresh</button></header>{run ? <div className="admin-run"><strong>{run.status !== "completed" ? "Release in progress" : run.conclusion === "success" ? "Release succeeded" : "Release needs attention"}</strong><small>{run.name} · {run.headBranch} · {format(run.updatedAt)}</small>{run.htmlUrl && <a href={run.htmlUrl} target="_blank" rel="noreferrer">Open run <ExternalLink /></a>}</div> : <p>No production release workflow run is available yet.</p>}</section></div>
    <section className="admin-safety"><ShieldCheck /><div><strong>Admin safety boundary</strong><p>Only server-side allowlisted platform administrators can use these release endpoints.</p></div></section>
  </main>;
}
