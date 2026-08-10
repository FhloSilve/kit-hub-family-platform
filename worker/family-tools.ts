import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

async function user(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}
async function member(c: Ctx, householdId: string, userId: string) {
  return c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,userId).first();
}
async function requireMember(c: Ctx) {
  const u = await user(c); if (!u) return { response: apiError(c,401,"AUTH_REQUIRED","Sign in to continue.") };
  const householdId = c.req.param("householdId") ?? "";
  if (!(await member(c,householdId,u.id))) return { response: apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.") };
  return { u, householdId };
}

app.get("/api/v1/households/:householdId/family-tools", async c => {
  const a=await requireMember(c); if(a.response) return a.response; const {u,householdId}=a;
  const [notifications,polls,attachments,locale,prefs]=await Promise.all([
    c.env.DB.prepare(`SELECT n.id,n.category,n.kind,n.title,n.body,n.entity_type entityType,n.entity_id entityId,n.direct,n.read_at readAt,n.created_at createdAt,u.name actorName FROM household_notifications n LEFT JOIN "user" u ON u.id=n.actor_user_id WHERE n.household_id=? AND n.user_id=? ORDER BY n.created_at DESC LIMIT 60`).bind(householdId,u.id).all(),
    c.env.DB.prepare(`SELECT p.id,p.question,p.multiple_choice multipleChoice,p.closes_at closesAt,p.created_at createdAt,u.name createdByName FROM household_polls p JOIN "user" u ON u.id=p.created_by WHERE p.household_id=? ORDER BY p.created_at DESC LIMIT 30`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT a.id,a.entity_type entityType,a.entity_id entityId,a.file_name fileName,a.mime_type mimeType,a.size_bytes sizeBytes,a.created_at createdAt,u.name uploadedByName FROM household_attachments a JOIN "user" u ON u.id=a.uploaded_by WHERE a.household_id=? ORDER BY a.created_at DESC LIMIT 40`).bind(householdId).all(),
    c.env.DB.prepare("SELECT language,region,time_zone timeZone FROM user_locale_preferences WHERE user_id=?").bind(u.id).first(),
    c.env.DB.prepare("SELECT meals,polls,attachments FROM household_notification_preferences WHERE household_id=? AND user_id=?").bind(householdId,u.id).first(),
  ]);
  const pollRows=[] as unknown[];
  for(const p of polls.results as Array<Record<string,unknown>>){
    const options=await c.env.DB.prepare(`SELECT o.id,o.label,COUNT(v.option_id) votes,EXISTS(SELECT 1 FROM household_poll_votes mine WHERE mine.poll_id=o.poll_id AND mine.option_id=o.id AND mine.user_id=?) votedByMe FROM household_poll_options o LEFT JOIN household_poll_votes v ON v.option_id=o.id WHERE o.poll_id=? GROUP BY o.id,o.label,o.position ORDER BY o.position`).bind(u.id,p.id).all();
    pollRows.push({...p,multipleChoice:Boolean(p.multipleChoice),options:options.results.map((o:any)=>({...o,votes:Number(o.votes),votedByMe:Boolean(o.votedByMe)}))});
  }
  return c.json({notifications:notifications.results.map((n:any)=>({...n,direct:Boolean(n.direct)})),polls:pollRows,attachments:attachments.results,locale:locale??{language:"en",region:"BE",timeZone:"Europe/Brussels"},preferences:{meals:Boolean((prefs as any)?.meals??1),polls:Boolean((prefs as any)?.polls??1),attachments:Boolean((prefs as any)?.attachments??0)}});
});

app.post("/api/v1/households/:householdId/notifications/read", async c=>{const a=await requireMember(c);if(a.response)return a.response;await c.env.DB.prepare("UPDATE household_notifications SET read_at=datetime('now') WHERE household_id=? AND user_id=? AND read_at IS NULL").bind(a.householdId,a.u.id).run();return c.json({ok:true});});

app.put("/api/v1/households/:householdId/family-tools/preferences",async c=>{const a=await requireMember(c);if(a.response)return a.response;const b=await c.req.json().catch(()=>null) as any;if(!b)return apiError(c,422,"VALIDATION_FAILED","Choose notification preferences.");await c.env.DB.prepare(`INSERT INTO household_notification_preferences(household_id,user_id,meals,polls,attachments) VALUES(?,?,?,?,?) ON CONFLICT(household_id,user_id) DO UPDATE SET meals=excluded.meals,polls=excluded.polls,attachments=excluded.attachments,updated_at=datetime('now')`).bind(a.householdId,a.u.id,b.meals?1:0,b.polls?1:0,b.attachments?1:0).run();return c.json({ok:true});});

app.put("/api/v1/households/:householdId/locale",async c=>{const a=await requireMember(c);if(a.response)return a.response;const b=await c.req.json().catch(()=>null) as any;const allowed=["en","nl","fr","de","es"];if(!b||!allowed.includes(b.language)||typeof b.region!=="string"||typeof b.timeZone!=="string")return apiError(c,422,"VALIDATION_FAILED","Check your language and region settings.");await c.env.DB.prepare(`INSERT INTO user_locale_preferences(user_id,language,region,time_zone) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,region=excluded.region,time_zone=excluded.time_zone,updated_at=datetime('now')`).bind(a.u.id,b.language,b.region.trim().toUpperCase().slice(0,8),b.timeZone.trim().slice(0,80)).run();return c.json({language:b.language,region:b.region.trim().toUpperCase(),timeZone:b.timeZone.trim()});});

app.post("/api/v1/households/:householdId/polls",async c=>{const a=await requireMember(c);if(a.response)return a.response;const b=await c.req.json().catch(()=>null) as any;const question=typeof b?.question==="string"?b.question.trim():"";const options=Array.isArray(b?.options)?b.options.map((x:unknown)=>typeof x==="string"?x.trim():"").filter(Boolean):[];if(!question||question.length>240||options.length<2||options.length>8)return apiError(c,422,"VALIDATION_FAILED","Add a question and 2 to 8 choices.");const id=crypto.randomUUID();await c.env.DB.batch([c.env.DB.prepare("INSERT INTO household_polls(id,household_id,question,multiple_choice,closes_at,created_by) VALUES(?,?,?,?,?,?)").bind(id,a.householdId,question,b.multipleChoice?1:0,b.closesAt||null,a.u.id),...options.map((label:string,i:number)=>c.env.DB.prepare("INSERT INTO household_poll_options(id,poll_id,label,position) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,label,i))]);await c.env.DB.prepare(`INSERT INTO household_notifications(id,household_id,user_id,actor_user_id,category,kind,title,body,entity_type,entity_id,direct) SELECT lower(hex(randomblob(16))),?,m.user_id,?,'polls','poll.created','New household poll',?,'poll',?,0 FROM memberships m LEFT JOIN household_notification_preferences p ON p.household_id=m.household_id AND p.user_id=m.user_id WHERE m.household_id=? AND m.status='active' AND m.user_id<>? AND COALESCE(p.polls,1)=1`).bind(a.householdId,a.u.id,question,id,a.householdId,a.u.id).run();return c.json({id},201);});

app.put("/api/v1/households/:householdId/polls/:pollId/vote",async c=>{const a=await requireMember(c);if(a.response)return a.response;const b=await c.req.json().catch(()=>null) as any;const ids=Array.isArray(b?.optionIds)?b.optionIds.filter((x:unknown)=>typeof x==="string"):[];const poll=await c.env.DB.prepare("SELECT multiple_choice multipleChoice,closes_at closesAt,closed_at closedAt FROM household_polls WHERE id=? AND household_id=?").bind(c.req.param("pollId"),a.householdId).first<any>();if(!poll)return apiError(c,404,"POLL_NOT_FOUND","That poll could not be found.");if(poll.closedAt||(poll.closesAt&&new Date(poll.closesAt)<=new Date()))return apiError(c,409,"POLL_CLOSED","This poll is closed.");if(!poll.multipleChoice&&ids.length>1)return apiError(c,422,"VALIDATION_FAILED","Choose one option.");const valid=await c.env.DB.prepare(`SELECT id FROM household_poll_options WHERE poll_id=?`).bind(c.req.param("pollId")).all<{id:string}>();const set=new Set(valid.results.map(x=>x.id));if(ids.some((id:string)=>!set.has(id)))return apiError(c,422,"VALIDATION_FAILED","Choose an option from this poll.");await c.env.DB.batch([c.env.DB.prepare("DELETE FROM household_poll_votes WHERE poll_id=? AND user_id=?").bind(c.req.param("pollId"),a.u.id),...ids.map((id:string)=>c.env.DB.prepare("INSERT INTO household_poll_votes(poll_id,option_id,user_id) VALUES(?,?,?)").bind(c.req.param("pollId"),id,a.u.id))]);return c.json({ok:true});});

app.post("/api/v1/households/:householdId/attachments",async c=>{const a=await requireMember(c);if(a.response)return a.response;const b=await c.req.json().catch(()=>null) as any;const types=["household","note","meal","recipe","message","task","event","poll"];if(!b||typeof b.fileName!=="string"||typeof b.mimeType!=="string"||typeof b.dataBase64!=="string"||!types.includes(b.entityType??"household"))return apiError(c,422,"VALIDATION_FAILED","Choose a valid file.");const size=Math.floor(b.dataBase64.length*3/4);if(size<1||size>1572864)return apiError(c,422,"FILE_TOO_LARGE","Files can be up to 1.5 MB.");const id=crypto.randomUUID();await c.env.DB.prepare("INSERT INTO household_attachments(id,household_id,uploaded_by,entity_type,entity_id,file_name,mime_type,size_bytes,data_base64) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,a.householdId,a.u.id,b.entityType??"household",b.entityId??null,b.fileName.slice(0,180),b.mimeType.slice(0,120),size,b.dataBase64).run();return c.json({id},201);});

app.get("/api/v1/households/:householdId/attachments/:attachmentId",async c=>{const a=await requireMember(c);if(a.response)return a.response;const row=await c.env.DB.prepare("SELECT file_name fileName,mime_type mimeType,data_base64 dataBase64 FROM household_attachments WHERE id=? AND household_id=?").bind(c.req.param("attachmentId"),a.householdId).first();if(!row)return apiError(c,404,"ATTACHMENT_NOT_FOUND","That attachment could not be found.");return c.json(row);});

export default app;