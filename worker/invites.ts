import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
const allowedRoles = new Set(["admin","adult","teen","child","guest"]);

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function tokenBytes() { const bytes=new Uint8Array(32); crypto.getRandomValues(bytes); return bytes; }
function base64url(bytes: Uint8Array) { let raw=""; for(const byte of bytes) raw+=String.fromCharCode(byte); return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function hashToken(token:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");}
async function session(c:any){const result=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});if(!result?.user)return null;return result;}
async function audit(c:any,userId:string|null,householdId:string|null,action:string,result:"success"|"denied"|"failure"){await c.env.DB.prepare("INSERT INTO audit_events(id,household_id,actor_user_id,action,resource_type,result,request_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(),householdId,userId,action,"household_invite",result,c.get("requestId")??null).run().catch(()=>undefined);}

app.get("/api/v1/households/:householdId/invites",async c=>{
 const rows=await c.env.DB.prepare("SELECT id,email,role_key role,status,expires_at expiresAt,created_at createdAt,updated_at updatedAt FROM household_invites WHERE household_id=? ORDER BY created_at DESC LIMIT 100").bind(c.req.param("householdId")).all();
 return c.json({invites:rows.results});
});

app.post("/api/v1/households/:householdId/invites",async c=>{
 const current=await session(c);if(!current)return apiError(c,401,"AUTH_REQUIRED","Sign in to continue.");
 const householdId=c.req.param("householdId"),body=await c.req.json().catch(()=>null) as any;
 const email=clean(body?.email,254).toLowerCase(),role=clean(body?.role,20)||"adult";
 if(!/^\S+@\S+\.\S+$/.test(email))return apiError(c,422,"INVITE_EMAIL_INVALID","Enter a valid email address.");
 if(!allowedRoles.has(role))return apiError(c,422,"INVITE_ROLE_INVALID","Choose Admin, Adult, Teen, Child or Guest.");
 const member=await c.env.DB.prepare("SELECT 1 found FROM memberships m JOIN \"user\" u ON u.id=m.user_id WHERE m.household_id=? AND lower(u.email)=lower(?) AND m.status='active' LIMIT 1").bind(householdId,email).first();
 if(member)return apiError(c,409,"ALREADY_A_MEMBER","That email already belongs to an active household member.");
 await c.env.DB.prepare("UPDATE household_invites SET status='expired',updated_at=datetime('now') WHERE household_id=? AND lower(email)=lower(?) AND status='pending' AND expires_at<=datetime('now')").bind(householdId,email).run();
 const pending=await c.env.DB.prepare("SELECT id FROM household_invites WHERE household_id=? AND lower(email)=lower(?) AND status='pending' AND expires_at>datetime('now') LIMIT 1").bind(householdId,email).first();
 if(pending)return apiError(c,409,"INVITE_ALREADY_PENDING","There is already an active invitation for that email. Revoke it before creating another.");
 const token=base64url(tokenBytes()),tokenHash=await hashToken(token),id=crypto.randomUUID();
 const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
 await c.env.DB.prepare("INSERT INTO household_invites(id,household_id,email,role_key,token_hash,status,invited_by,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,datetime('now'),datetime('now'))").bind(id,householdId,email,role,tokenHash,current.user.id,expiresAt).run();
 await audit(c,current.user.id,householdId,"invite.created","success");
 return c.json({id,email,role,expiresAt,inviteToken:token,invitePath:`/invite?token=${encodeURIComponent(token)}`,note:"The raw invitation token is returned only now and is never stored by Kit Hub."},201);
});

app.delete("/api/v1/households/:householdId/invites/:inviteId",async c=>{
 const current=await session(c);if(!current)return apiError(c,401,"AUTH_REQUIRED","Sign in to continue.");
 const householdId=c.req.param("householdId");
 const result=await c.env.DB.prepare("UPDATE household_invites SET status='revoked',updated_at=datetime('now') WHERE id=? AND household_id=? AND status='pending'").bind(c.req.param("inviteId"),householdId).run();
 if(!result.meta.changes)return apiError(c,404,"INVITE_NOT_PENDING","That pending invitation could not be found.");
 await audit(c,current.user.id,householdId,"invite.revoked","success");
 return c.json({revoked:true});
});

app.get("/api/v1/invites/preview",async c=>{
 const token=clean(c.req.query("token"),200);if(!token)return apiError(c,422,"INVITE_TOKEN_REQUIRED","Invitation token is required.");
 const tokenHash=await hashToken(token);
 const row=await c.env.DB.prepare("SELECT i.id,i.email,i.role_key role,i.status,i.expires_at expiresAt,h.name householdName FROM household_invites i JOIN households h ON h.id=i.household_id WHERE i.token_hash=? LIMIT 1").bind(tokenHash).first<any>();
 if(!row||row.status!=="pending"||new Date(row.expiresAt)<=new Date())return apiError(c,404,"INVITE_INVALID","This invitation is invalid, expired or already used.");
 return c.json({householdName:row.householdName,email:row.email,role:row.role,expiresAt:row.expiresAt});
});

app.post("/api/v1/invites/accept",async c=>{
 const current=await session(c);if(!current)return apiError(c,401,"AUTH_REQUIRED","Sign in with the invited email to accept this invitation.");
 const body=await c.req.json().catch(()=>null) as any,token=clean(body?.token,200);if(!token)return apiError(c,422,"INVITE_TOKEN_REQUIRED","Invitation token is required.");
 const tokenHash=await hashToken(token);
 const invite=await c.env.DB.prepare("SELECT id,household_id householdId,email,role_key role,status,expires_at expiresAt FROM household_invites WHERE token_hash=? LIMIT 1").bind(tokenHash).first<any>();
 if(!invite||invite.status!=="pending")return apiError(c,404,"INVITE_INVALID","This invitation is invalid or already used.");
 if(new Date(invite.expiresAt)<=new Date()){await c.env.DB.prepare("UPDATE household_invites SET status='expired',updated_at=datetime('now') WHERE id=?").bind(invite.id).run();return apiError(c,409,"INVITE_EXPIRED","This invitation has expired.");}
 if(String(current.user.email).toLowerCase()!==String(invite.email).toLowerCase()){await audit(c,current.user.id,invite.householdId,"invite.email_mismatch","denied");return apiError(c,403,"INVITE_EMAIL_MISMATCH","Sign in with the exact email address this invitation was sent to.");}
 const existing=await c.env.DB.prepare("SELECT 1 found FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1").bind(invite.householdId,current.user.id).first();
 if(existing)return apiError(c,409,"ALREADY_A_MEMBER","This account is already an active member of that household.");
 const membershipId=crypto.randomUUID();
 await c.env.DB.batch([
   c.env.DB.prepare("INSERT INTO memberships(id,household_id,user_id,role_key,status,joined_at,created_at,updated_at) VALUES(?,?,?,?, 'active',datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(household_id,user_id) DO UPDATE SET role_key=excluded.role_key,status='active',joined_at=COALESCE(memberships.joined_at,datetime('now')),updated_at=datetime('now')").bind(membershipId,invite.householdId,current.user.id,invite.role),
   c.env.DB.prepare("UPDATE household_invites SET status='accepted',updated_at=datetime('now') WHERE id=? AND status='pending'").bind(invite.id),
 ]);
 await audit(c,current.user.id,invite.householdId,"invite.accepted","success");
 return c.json({accepted:true,householdId:invite.householdId,role:invite.role});
});

export default app;
