import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CheckCircle2, Circle, Mail, RefreshCw, Road, ShieldCheck, Sparkles, UserPlus, UsersRound } from "lucide-react";
import "../admin-launch-readiness.css";

type RoadmapStatus = "planned" | "building" | "testing" | "ready";
type TesterStatus = "invited" | "active" | "paused";
type LaunchSetting = "private_beta_enabled" | "public_landing_ready" | "legal_privacy_ready" | "email_communication_ready";
type Ops = {
  roadmap: Array<{ id:string; title:string; description:string|null; status:RoadmapStatus; sortOrder:number; updatedAt:string }>;
  testers: Array<{ email:string; displayName:string|null; status:TesterStatus; notes:string|null; invitedAt:string; activatedAt:string|null }>;
  settings: Record<LaunchSetting, boolean>;
  checklist: Array<{ key:string; label:string; done:boolean }>;
  readiness: { completed:number; total:number; percent:number };
  analytics: {
    totalHouseholds:number;
    activeToday:number;
    active7Days:number;
    trackedDailyRows:number;
    retentionEligible:number;
    retained:number;
    retention7DayPercent:number|null;
    topFeatures:Array<{eventKey:string;count:number}>;
  };
  feedbackCount:number;
  privacyNote:string;
};

const statusLabels:Record<RoadmapStatus,string>={planned:"Planned",building:"Building",testing:"Testing",ready:"Ready"};
const featureLabels:Record<string,string>={calendar_view:"Calendar",tasks_view:"Tasks",groceries_view:"Groceries",meals_view:"Meals",family_hub_view:"Family Hub",family_plan_view:"Family Plan",routines_view:"Routines",search_used:"Search",feedback_opened:"Feedback",silvi_opened:"Silvi"};
const settingCopy:Record<LaunchSetting,{title:string;detail:string}>={
  private_beta_enabled:{title:"Private beta gate",detail:"When on, only platform admins and emails on the tester list can enter Kit Hub."},
  public_landing_ready:{title:"Public product page",detail:"Mark ready once positioning, screenshots and the product tour are prepared."},
  legal_privacy_ready:{title:"Privacy & legal copy",detail:"Mark ready once public privacy, terms and data-handling explanations are reviewed."},
  email_communication_ready:{title:"Email communication",detail:"Mark ready once an email provider, opt-outs and beta/onboarding templates are actually connected."},
};

async function request<T>(url:string,init?:RequestInit){const response=await fetch(url,{credentials:"include",...init,headers:{"content-type":"application/json",...init?.headers}});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Admin launch data could not be updated.");return body as T}

export function AdminLaunchReadiness(){
  const[host,setHost]=useState<HTMLElement|null>(null),[data,setData]=useState<Ops|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[testerEmail,setTesterEmail]=useState(""),[testerName,setTesterName]=useState("");
  useEffect(()=>{const locate=()=>setHost(document.querySelector<HTMLElement>(".admin-page"));locate();const observer=new MutationObserver(locate);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
  async function load(){setBusy(true);setError("");try{setData(await request<Ops>("/api/v1/admin/product-ops"))}catch(e){setError(e instanceof Error?e.message:"Launch readiness could not be loaded.")}finally{setBusy(false)}}
  useEffect(()=>{if(host)void load()},[host]);
  async function roadmapStatus(id:string,status:RoadmapStatus){setError("");try{await request(`/api/v1/admin/product-ops/roadmap/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({status})});await load()}catch(e){setError(e instanceof Error?e.message:"Roadmap status could not be saved.")}}
  async function testerStatus(email:string,status:TesterStatus){setError("");try{await request(`/api/v1/admin/product-ops/beta-testers/${encodeURIComponent(email)}`,{method:"PATCH",body:JSON.stringify({status})});await load()}catch(e){setError(e instanceof Error?e.message:"Tester status could not be saved.")}}
  async function addTester(event:FormEvent){event.preventDefault();if(!testerEmail.trim())return;setError("");try{await request("/api/v1/admin/product-ops/beta-testers",{method:"POST",body:JSON.stringify({email:testerEmail.trim(),displayName:testerName.trim()||null})});setTesterEmail("");setTesterName("");await load()}catch(e){setError(e instanceof Error?e.message:"Tester could not be added.")}}
  async function toggleSetting(key:LaunchSetting,value:boolean){setError("");try{await request(`/api/v1/admin/product-ops/settings/${key}`,{method:"PUT",body:JSON.stringify({value})});await load()}catch(e){setError(e instanceof Error?e.message:"Launch setting could not be saved.")}}
  const maxFeature=useMemo(()=>Math.max(1,...(data?.analytics.topFeatures.map(x=>x.count)??[1])),[data]);
  if(!host)return null;
  return createPortal(<section className="admin-launch-shell">
    <header className="admin-launch-heading"><div><small>PRE-LAUNCH & PRIVATE BETA</small><h2>Launch readiness</h2><p>Build the product infrastructure around Kit Hub before inviting more households: roadmap, controlled beta access, privacy-safe adoption signals, retention and communication readiness.</p></div><button className="admin-secondary" onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?"spin":""}/>{busy?"Refreshing…":"Refresh"}</button></header>
    {error&&<div className="admin-launch-error">{error}</div>}
    {data&&<>
      <div className="admin-launch-readiness"><div className="admin-launch-ring" style={{"--readiness":`${data.readiness.percent}%`} as React.CSSProperties}><strong>{data.readiness.percent}%</strong><span>beta ready</span></div><div><h3>{data.readiness.completed} of {data.readiness.total} launch checks complete</h3><p>Readiness is intentionally practical rather than cosmetic. A lower score is useful if it shows exactly what still needs work.</p><div className="admin-launch-checks">{data.checklist.map(item=><span key={item.key} className={item.done?"is-done":""}>{item.done?<CheckCircle2/>:<Circle/>}{item.label}</span>)}</div></div></div>

      <div className="admin-launch-metrics"><article><UsersRound/><strong>{data.analytics.activeToday}</strong><span>Active households today</span><small>{data.analytics.totalHouseholds} household{data.analytics.totalHouseholds===1?"":"s"} total</small></article><article><BarChart3/><strong>{data.analytics.active7Days}</strong><span>Active in 7 days</span><small>Distinct households, not people</small></article><article><RefreshCw/><strong>{data.analytics.retention7DayPercent===null?"—":`${data.analytics.retention7DayPercent}%`}</strong><span>7-day return</span><small>{data.analytics.retentionEligible?`${data.analytics.retained} of ${data.analytics.retentionEligible} eligible households returned`:"Needs at least 7 days of beta usage"}</small></article><article><Sparkles/><strong>{data.feedbackCount}</strong><span>Tester feedback items</span><small>Use this beside retention, not instead of it</small></article></div>

      <div className="admin-launch-grid">
        <article className="admin-launch-card admin-launch-roadmap"><header><Road/><div><small>PRODUCT ROADMAP</small><h3>What happens after the next release?</h3></div></header><div className="admin-roadmap-list">{data.roadmap.map(item=><div key={item.id}><span className={`roadmap-dot is-${item.status}`}/><div><strong>{item.title}</strong><small>{item.description}</small></div><select value={item.status} onChange={e=>void roadmapStatus(item.id,e.target.value as RoadmapStatus)}>{(Object.keys(statusLabels) as RoadmapStatus[]).map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select></div>)}</div></article>

        <article className="admin-launch-card"><header><BarChart3/><div><small>PRIVACY-SAFE ANALYTICS</small><h3>What households actually use</h3></div></header><p className="admin-launch-privacy"><ShieldCheck/>{data.privacyNote}</p>{data.analytics.topFeatures.length?<div className="admin-feature-bars">{data.analytics.topFeatures.map(feature=><div key={feature.eventKey}><span><strong>{featureLabels[feature.eventKey]||feature.eventKey}</strong><small>{feature.count} open{feature.count===1?"":"s"} / actions in 30 days</small></span><i><b style={{width:`${Math.max(8,(feature.count/maxFeature)*100)}%`}}/></i></div>)}</div>:<p>No feature-usage counters yet. They will appear after this release is used.</p>}</article>
      </div>

      <div className="admin-launch-grid">
        <article className="admin-launch-card"><header><UserPlus/><div><small>PRIVATE BETA</small><h3>Invite households deliberately</h3></div></header><form className="admin-beta-add" onSubmit={event=>void addTester(event)}><input type="email" value={testerEmail} onChange={e=>setTesterEmail(e.target.value)} placeholder="tester@example.com" required/><input value={testerName} onChange={e=>setTesterName(e.target.value)} placeholder="Name / household (optional)"/><button type="submit">Add tester</button></form><p className="admin-launch-note">Adding an email places it on the access list. Email delivery is not faked: until an email provider is connected, share the beta invitation manually.</p><div className="admin-beta-list">{data.testers.length?data.testers.map(tester=><div key={tester.email}><span><strong>{tester.displayName||tester.email}</strong>{tester.displayName&&<small>{tester.email}</small>}<small>{tester.activatedAt?`Activated ${new Date(tester.activatedAt).toLocaleDateString()}`:`Invited ${new Date(tester.invitedAt).toLocaleDateString()}`}</small></span><select value={tester.status} onChange={e=>void testerStatus(tester.email,e.target.value as TesterStatus)}><option value="invited">Invited</option><option value="active">Active</option><option value="paused">Paused</option></select></div>):<p>No beta testers added yet.</p>}</div></article>

        <article className="admin-launch-card"><header><ShieldCheck/><div><small>LAUNCH CONTROLS</small><h3>Only mark what is genuinely ready</h3></div></header><div className="admin-launch-switches">{(Object.keys(settingCopy) as LaunchSetting[]).map(key=><label key={key}><input type="checkbox" checked={Boolean(data.settings[key])} onChange={e=>void toggleSetting(key,e.target.checked)}/><span><strong>{settingCopy[key].title}</strong><small>{settingCopy[key].detail}</small></span></label>)}</div>{data.settings.private_beta_enabled&&<div className="admin-beta-warning"><ShieldCheck/><span><strong>Private beta gate is ON</strong><small>Only admins and tester emails marked Invited or Active can enter the app.</small></span></div>}</article>
      </div>

      <article className="admin-launch-card admin-email-foundation"><header><Mail/><div><small>EMAIL COMMUNICATION FOUNDATION</small><h3>Prepare communication without spamming families</h3></div></header><p>Kit Hub should eventually support three opt-in email families: a short welcome/onboarding sequence, private-beta updates, and meaningful release notes. The application does not claim to send these until a real provider and unsubscribe flow are connected.</p><div className="admin-email-templates"><span><strong>Welcome</strong><small>Help a new household complete setup and discover one useful shared workflow.</small></span><span><strong>Beta update</strong><small>Ask focused questions, link to feedback and explain what changed.</small></span><span><strong>Release note</strong><small>Only send when an update is meaningful enough to bring a household back.</small></span></div></article>
    </>}
  </section>,host);
}
