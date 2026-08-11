import { useEffect, useState } from "react";
import type { BootstrapResponse, HouseholdSummary } from "../shared/contracts";
import { AdminConsole } from "./components/AdminConsole";
import { AdminFeedbackPage } from "./components/AdminFeedbackPage";
import { AttachmentEnhancer } from "./components/AttachmentEnhancer";
import { AppearanceControl } from "./components/AppearanceControl";
import { AuthScreen } from "./components/AuthScreen";
import { AppUpdatePrompt } from "./components/AppUpdatePrompt";
import { Brand } from "./components/Brand";
import { FamilyToolsDock } from "./components/FamilyToolsDock";
import { FeedbackDock } from "./components/FeedbackDock";
import { HouseholdCoordinationDock } from "./components/HouseholdCoordinationDock";
import { HouseholdOnboarding } from "./components/HouseholdOnboarding";
import { MobileTopbarActions } from "./components/MobileTopbarActions";
import { StableLocalizedSurface } from "./components/StableLocalizedSurface";
import { PlatformAdminEntry } from "./components/PlatformAdminEntry";
import { PullToRefresh } from "./components/PullToRefresh";
import { RoutinesDock } from "./components/RoutinesDock";
import { SilviDock } from "./components/SilviDock";
import { SilviSuggestionPreferences } from "./components/SilviSuggestionPreferences";
import { TodayDashboard } from "./components/TodayDashboard";
import { UiPersistenceGuard } from "./components/UiPersistenceGuard";
import { UiStabilityRuntime } from "./components/UiStabilityRuntime";
import { ApiError, api } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { demoBootstrap } from "./lib/demo-data";

const isDemo = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";
const isAdminPath = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
export default function App(){if(isAdminPath)return <><UiStabilityRuntime/><AppearanceControl/><AdminRoute/></>;if(isDemo)return <><UiStabilityRuntime/><AppearanceControl/><UiPersistenceGuard/><StableLocalizedSurface/><PullToRefresh/><TodayDashboard bootstrap={demoBootstrap} demo onSignOut={async()=>{window.history.replaceState({},"",window.location.pathname);window.location.reload()}}/><MobileTopbarActions/></>;return <><UiStabilityRuntime/><AppearanceControl/><UiPersistenceGuard/><StableLocalizedSurface/><PullToRefresh/><ConnectedApp/><MobileTopbarActions/><AppUpdatePrompt/></>}
function AdminRoute(){const session=authClient.useSession();if(session.isPending)return <LoadingScreen label="Checking your admin session…"/>;if(!session.data?.user)return <><AuthScreen onAuthenticated={session.refetch}/><AppUpdatePrompt/></>;const feedback=window.location.pathname.startsWith("/admin/feedback");return <><PullToRefresh/>{feedback?<AdminFeedbackPage onBack={()=>{window.location.href="/"}}/>:<AdminConsole onBack={()=>{window.location.href="/"}}/>}<AppUpdatePrompt/></>}
function ConnectedApp(){const session=authClient.useSession();const [bootstrap,setBootstrap]=useState<BootstrapResponse|null>(null);const [loadingBootstrap,setLoadingBootstrap]=useState(false);const [bootstrapError,setBootstrapError]=useState<{message:string;requestId?:string}|null>(null);const [bootstrapAttempt,setBootstrapAttempt]=useState(0);useEffect(()=>{if(!session.data?.user)return;let cancelled=false;setLoadingBootstrap(true);setBootstrapError(null);void api.bootstrap().then(data=>{if(!cancelled)setBootstrap(data)}).catch((error:unknown)=>{if(!cancelled)setBootstrapError(error instanceof ApiError?{message:error.message,requestId:error.requestId}:{message:"Kit Hub could not load your household."})}).finally(()=>{if(!cancelled)setLoadingBootstrap(false)});return()=>{cancelled=true}},[session.data?.user,bootstrapAttempt]);async function signOut(){await authClient.signOut();setBootstrap(null);await session.refetch()}function handleHouseholdCreated(household:HouseholdSummary){if(!bootstrap)return;setBootstrap({...bootstrap,households:[...bootstrap.households,household],activeHousehold:household})}if(session.isPending)return <LoadingScreen label="Opening the front door…"/>;if(!session.data?.user)return <AuthScreen onAuthenticated={session.refetch}/>;if(loadingBootstrap&&!bootstrap)return <LoadingScreen label="Bringing your household home…"/>;if(bootstrapError&&!bootstrap)return <main className="fatal-state"><Brand/><div><h1>We couldn&apos;t open Kit Hub.</h1><p>{bootstrapError.message}</p>{bootstrapError.requestId&&<small className="request-reference">Reference: {bootstrapError.requestId}</small>}<div className="fatal-state__actions"><button className="button button--primary" type="button" onClick={()=>setBootstrapAttempt(a=>a+1)}>Try again</button><button className="button button--secondary" type="button" onClick={()=>void signOut()}>Sign out</button></div></div></main>;if(!bootstrap)return <LoadingScreen label="Setting things up…"/>;if(!bootstrap.activeHousehold)return <HouseholdOnboarding bootstrap={bootstrap} onCreated={handleHouseholdCreated} onSignOut={signOut}/>;return <><TodayDashboard bootstrap={bootstrap} onSignOut={signOut}/><AttachmentEnhancer householdId={bootstrap.activeHousehold.id}/><HouseholdCoordinationDock householdId={bootstrap.activeHousehold.id}/><RoutinesDock householdId={bootstrap.activeHousehold.id}/><SilviDock householdId={bootstrap.activeHousehold.id}/><SilviSuggestionPreferences householdId={bootstrap.activeHousehold.id}/><FamilyToolsDock householdId={bootstrap.activeHousehold.id}/><FeedbackDock householdId={bootstrap.activeHousehold.id}/><PlatformAdminEntry/></>}
function LoadingScreen({label}:{label:string}){return <main className="loading-screen"><Brand/><span className="loading-orbit" aria-hidden="true"><i/></span><p>{label}</p></main>}
