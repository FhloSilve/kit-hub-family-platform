import { useEffect, useState } from "react";
import type { BootstrapResponse, HouseholdSummary } from "../shared/contracts";
import { AdminConsole } from "./components/AdminConsole";
import { AuthScreen } from "./components/AuthScreen";
import { AppUpdatePrompt } from "./components/AppUpdatePrompt";
import { Brand } from "./components/Brand";
import { HouseholdOnboarding } from "./components/HouseholdOnboarding";
import { HouseholdOnboarding } from "./components/HouseholdOnboarding";
import { TodayDashboard } from "./components/TodayDashboard";
import { ApiError, api } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { demoBootstrap } from "./lib/demo-data";

const isDemo = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";
const isAdminPath = window.location.pathname === "/admin" || window.location.pathname === "/admin/";

export default function App() {
  if (isAdminPath) return <><AdminConsole onBack={() => { window.location.href = "/"; }} /><AppUpdatePrompt /></>;
  if (isDemo) return <TodayDashboard bootstrap={demoBootstrap} demo onSignOut={async () => { window.history.replaceState({}, "", window.location.pathname); window.location.reload(); }} />;
  return <><ConnectedApp /><AppUpdatePrompt /></>;
}

function ConnectedApp() {
  const session = authClient.useSession();
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<{ message: string; requestId?: string } | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  useEffect(() => {
    if (!session.data?.user) return;
    let cancelled = false; setLoadingBootstrap(true); setBootstrapError(null);
    void api.bootstrap().then((data) => { if (!cancelled) setBootstrap(data); }).catch((error: unknown) => { if (!cancelled) setBootstrapError(error instanceof ApiError ? { message: error.message, requestId: error.requestId } : { message: "Kit Hub could not load your household." }); }).finally(() => { if (!cancelled) setLoadingBootstrap(false); });
    return () => { cancelled = true; };
  }, [session.data?.user, bootstrapAttempt]);
  async function signOut() { await authClient.signOut(); setBootstrap(null); await session.refetch(); }
  function handleHouseholdCreated(household: HouseholdSummary) { if (!bootstrap) return; setBootstrap({ ...bootstrap, households: [...bootstrap.households, household], activeHousehold: household }); }
  if (session.isPending) return <LoadingScreen label="Opening the front door…" />;
  if (!session.data?.user) return <AuthScreen onAuthenticated={session.refetch} />;
  if (loadingBootstrap && !bootstrap) return <LoadingScreen label="Bringing your household home…" />;
  if (bootstrapError && !bootstrap) return <main className="fatal-state"><Brand /><div><h1>We couldn&apos;t open Kit Hub.</h1><p>{bootstrapError.message}</p>{bootstrapError.requestId && <small className="request-reference">Reference: {bootstrapError.requestId}</small>}<div className="fatal-state__actions"><button className="button button--primary" type="button" onClick={() => setBootstrapAttempt((attempt) => attempt + 1)}>Try again</button><button className="button button--secondary" type="button" onClick={() => void signOut()}>Sign out</button></div></div></main>;
  if (!bootstrap) return <LoadingScreen label="Setting things up…" />;
  if (!bootstrap.activeHousehold) return <HouseholdOnboarding bootstrap={bootstrap} onCreated={handleHouseholdCreated} onSignOut={signOut} />;
  return <TodayDashboard bootstrap={bootstrap} onSignOut={signOut} />;
}
function LoadingScreen({ label }: { label: string }) { return <main className="loading-screen"><Brand /><span className="loading-orbit" aria-hidden="true"><i /></span><p>{label}</p></main>; }
