import { ArrowRight, CheckCircle2, Clock3, Home, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "../lib/auth-client";
import { AuthScreen } from "./AuthScreen";
import { Brand } from "./Brand";
import "../invite-acceptance.css";

type InvitePreview={householdName:string;email:string;role:string;expiresAt:string};
type ApiErrorBody={error?:{message?:string;code?:string}};

async function jsonRequest<T>(url:string,init?:RequestInit){
 const response=await fetch(url,{credentials:"include",...init,headers:{"content-type":"application/json",...init?.headers}});
 const body=await response.json().catch(()=>({})) as T&ApiErrorBody;
 if(!response.ok){const error=new Error(body.error?.message||"Kit Hub could not complete that invitation request.") as Error&{code?:string};error.code=body.error?.code;throw error;}
 return body as T;
}

function roleLabel(role:string){return role ? role.charAt(0).toUpperCase()+role.slice(1) : "Member"}
function expiryLabel(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"soon":date.toLocaleString()}

export function InviteAcceptancePage(){
 const session=authClient.useSession();
 const token=useMemo(()=>new URLSearchParams(window.location.search).get("token")?.trim()||"",[]);
 const[preview,setPreview]=useState<InvitePreview|null>(null);
 const[loading,setLoading]=useState(true);
 const[accepting,setAccepting]=useState(false);
 const[showAuth,setShowAuth]=useState(false);
 const[error,setError]=useState<{message:string;code?:string}|null>(null);

 useEffect(()=>{let cancelled=false;if(!token){setError({message:"This invitation link is incomplete.",code:"INVITE_TOKEN_REQUIRED"});setLoading(false);return;}setLoading(true);jsonRequest<InvitePreview>(`/api/v1/invites/preview?token=${encodeURIComponent(token)}`).then(data=>{if(!cancelled){setPreview(data);setError(null)}}).catch((cause:unknown)=>{if(!cancelled)setError({message:cause instanceof Error?cause.message:"This invitation could not be opened.",code:(cause as {code?:string})?.code})}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[token]);

 async function accept(){if(!token||!session.data?.user)return;setAccepting(true);setError(null);try{await jsonRequest<{accepted:true;householdId:string;role:string}>("/api/v1/invites/accept",{method:"POST",body:JSON.stringify({token})});window.location.href="/"}catch(cause){setError({message:cause instanceof Error?cause.message:"The invitation could not be accepted.",code:(cause as {code?:string})?.code});setAccepting(false)}}

 if(showAuth&&!session.data?.user)return <AuthScreen onAuthenticated={async()=>{await session.refetch();setShowAuth(false)}}/>;
 const signedInEmail=String(session.data?.user?.email||"").toLowerCase();
 const invitedEmail=String(preview?.email||"").toLowerCase();
 const emailMatches=Boolean(signedInEmail&&invitedEmail&&signedInEmail===invitedEmail);

 return <main className="invite-page"><div className="invite-shell"><header className="invite-brand"><Brand/><span><ShieldCheck/> Secure household invitation</span></header><section className="invite-card">{loading?<div className="invite-state"><span className="invite-loader"/><h1>Checking your invitation…</h1><p>Kit Hub is validating the link before showing any household details.</p></div>:error&&!preview?<div className="invite-state invite-state--error"><ShieldCheck/><p className="eyebrow">INVITATION UNAVAILABLE</p><h1>This invitation cannot be used.</h1><p>{error.message}</p><button className="button button--secondary" type="button" onClick={()=>{window.location.href="/"}}>Go to Kit Hub</button></div>:preview?<><div className="invite-hero"><span className="invite-hero__icon"><Home/></span><p className="eyebrow">YOU&apos;RE INVITED</p><h1>Join {preview.householdName}</h1><p>Accepting adds your signed-in Kit Hub account to this household. The invitation is single-use and tied to the email below.</p></div><div className="invite-facts"><article><Mail/><div><small>Invited email</small><strong>{preview.email}</strong></div></article><article><UserRoundCheck/><div><small>Household role</small><strong>{roleLabel(preview.role)}</strong></div></article><article><Clock3/><div><small>Invitation expires</small><strong>{expiryLabel(preview.expiresAt)}</strong></div></article></div>{session.isPending?<p className="invite-session-note">Checking your signed-in account…</p>:!session.data?.user?<div className="invite-action-card"><h2>Use the invited email</h2><p>Sign in or create a Kit Hub account with <strong>{preview.email}</strong>. You&apos;ll return to this invitation afterwards.</p><button className="button button--primary button--wide" type="button" onClick={()=>setShowAuth(true)}>Sign in or create account <ArrowRight/></button></div>:!emailMatches?<div className="invite-action-card invite-action-card--warning"><h2>This is a different account</h2><p>You are signed in as <strong>{session.data.user.email}</strong>, but this invitation belongs to <strong>{preview.email}</strong>.</p><button className="button button--primary button--wide" type="button" onClick={async()=>{await authClient.signOut();await session.refetch();setShowAuth(true)}}>Use the invited account</button></div>:<div className="invite-action-card invite-action-card--ready"><CheckCircle2/><div><h2>Ready to join</h2><p>You are signed in as the invited account. Kit Hub will add you only after you press the button below.</p></div><button className="button button--primary button--wide" type="button" disabled={accepting} onClick={()=>void accept()}>{accepting?"Joining household…":`Join ${preview.householdName}`} {!accepting&&<ArrowRight/>}</button></div>}{error&&preview&&<div className="form-message form-message--error" role="alert">{error.message}</div>}<p className="invite-privacy"><ShieldCheck/> The invitation token is never stored in plain text by Kit Hub and becomes unusable after it is accepted, revoked or expires.</p></>:null}</section></div></main>
}
