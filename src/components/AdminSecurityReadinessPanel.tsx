import { useEffect, useState, type CSSProperties } from "react";
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";

type Check={key:string;label:string;done:boolean;detail:string};
type Data={checks:Check[];readiness:{completed:number;total:number;percent:number};live:{households:number;activeMemberships:number;pendingSilviProposals:number;activeRateBuckets24h:number;clientErrors7d:number;silviErrors7d:number;failedRefreshes7d:number;slowViews7d:number};principles:string[]};
async function request<T>(url:string){const response=await fetch(url,{credentials:"include"});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Security readiness could not be loaded.");return body as T}

export function AdminSecurityReadinessPanel(){
  const[data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){setBusy(true);setError("");try{setData(await request<Data>("/api/v1/admin/security-readiness"))}catch(e){setError(e instanceof Error?e.message:"Security readiness could not be loaded.")}finally{setBusy(false)}}
  useEffect(()=>{void load()},[]);
  return <section className="admin-launch-shell">
    <header className="admin-launch-heading"><div><small>PRIVATE BETA SECURITY</small><h2>Security & reliability gate</h2><p>A concise view of the protections that must hold before external households are invited.</p></div><button className="admin-secondary" type="button" onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?"spin":""}/>{busy?"Checking…":"Run security check"}</button></header>
    {error&&<div className="admin-launch-error">{error}</div>}
    {data&&<>
      <div className="admin-launch-readiness"><div className="admin-launch-ring" style={{"--readiness":`${data.readiness.percent}%`} as CSSProperties}><strong>{data.readiness.percent}%</strong><span>security ready</span></div><div><h3>{data.readiness.completed} of {data.readiness.total} security checks pass</h3><p>Checks combine enforced server protections with live production configuration. Anything incomplete should stay visible until it is resolved.</p><div className="admin-launch-checks">{data.checks.map(item=><span key={item.key} className={item.done?"is-done":""} title={item.detail}>{item.done?<CheckCircle2/>:<CircleAlert/>}{item.label}</span>)}</div></div></div>
      <div className="admin-launch-metrics"><article><ShieldCheck/><strong>{data.live.households}</strong><span>Households</span><small>{data.live.activeMemberships} active memberships</small></article><article><ShieldCheck/><strong>{data.live.pendingSilviProposals}</strong><span>Pending Silvi approvals</span><small>All expire and remain user scoped</small></article><article><ShieldCheck/><strong>{data.live.activeRateBuckets24h}</strong><span>Active rate buckets</span><small>Last 24 hours</small></article><article><ShieldCheck/><strong>{data.live.clientErrors7d+data.live.silviErrors7d+data.live.failedRefreshes7d}</strong><span>Recorded failures</span><small>7 days · {data.live.slowViews7d} slow views</small></article></div>
      <article className="admin-launch-card"><header><ShieldCheck/><div><small>ENFORCED PRINCIPLES</small><h3>What Kit Hub now guarantees at the API boundary</h3></div></header><div className="admin-launch-checks">{data.principles.map(item=><span key={item} className="is-done"><CheckCircle2/>{item}</span>)}</div></article>
    </>}
  </section>
}
