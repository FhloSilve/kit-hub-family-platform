import { Hono } from "hono";
import { createAuth } from "./auth";
import { requirePlatformAdmin } from "./admin";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

async function getUser(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}
async function requireHouseholdUser(c: Ctx) {
  const user = await getUser(c);
  if (!user) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to send feedback.") };
  const householdId = c.req.param("householdId") ?? "";
  const member = await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,user.id).first();
  if (!member) return { response: apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.") };
  return { user, householdId };
}

app.get("/api/v1/households/:householdId/feedback/mine", async c => {
  const access=await requireHouseholdUser(c); if(access.response)return access.response;
  const rows=await c.env.DB.prepare(`SELECT id,kind,title,description,details,error_text errorText,page_url pageUrl,status,created_at createdAt,
    (SELECT COUNT(*) FROM tester_feedback_screenshots s WHERE s.feedback_id=tester_feedback.id) screenshotCount
    FROM tester_feedback WHERE household_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50`).bind(access.householdId,access.user.id).all();
  return c.json({items:rows.results});
});

app.post("/api/v1/households/:householdId/feedback", async c => {
  const access=await requireHouseholdUser(c); if(access.response)return access.response;
  const body=await c.req.json().catch(()=>null) as any;
  const kind=body?.kind==="suggestion"?"suggestion":"issue";
  const title=typeof body?.title==="string"?body.title.trim():"";
  const description=typeof body?.description==="string"?body.description.trim():"";
  if(!title||title.length>160||!description||description.length>3000)return apiError(c,422,"VALIDATION_FAILED","Add a title and description for your feedback.");
  const id=crypto.randomUUID();
  const details=typeof body?.details==="string"?body.details.trim().slice(0,3000)||null:null;
  const errorText=typeof body?.errorText==="string"?body.errorText.trim().slice(0,4000)||null:null;
  const pageUrl=typeof body?.pageUrl==="string"?body.pageUrl.slice(0,1000):null;
  const userAgent=typeof body?.userAgent==="string"?body.userAgent.slice(0,1000):null;
  const screenshots=Array.isArray(body?.screenshots)?body.screenshots.slice(0,3):[];
  const writes=[c.env.DB.prepare(`INSERT INTO tester_feedback(id,household_id,user_id,kind,title,description,details,error_text,page_url,user_agent)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,access.householdId,access.user.id,kind,title,description,details,errorText,pageUrl,userAgent)];
  for(const shot of screenshots){
    if(!shot||typeof shot.fileName!=="string"||typeof shot.mimeType!=="string"||typeof shot.dataBase64!=="string")continue;
    if(!["image/png","image/jpeg","image/webp"].includes(shot.mimeType))continue;
    const size=Math.floor(shot.dataBase64.length*3/4); if(size<1||size>1572864)continue;
    writes.push(c.env.DB.prepare("INSERT INTO tester_feedback_screenshots(id,feedback_id,file_name,mime_type,size_bytes,data_base64) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,shot.fileName.slice(0,180),shot.mimeType,size,shot.dataBase64));
  }
  await c.env.DB.batch(writes);
  return c.json({id,status:"new"},201);
});

app.get("/api/v1/admin/feedback", async c => {
  const access=await requirePlatformAdmin(c); if(access.response)return access.response;
  const rows=await c.env.DB.prepare(`SELECT f.id,f.kind,f.title,f.description,f.details,f.error_text errorText,f.page_url pageUrl,f.status,
    COALESCE(f.priority,'normal') priority,f.created_at createdAt,u.name userName,u.email userEmail,h.name householdName,
    (SELECT COUNT(*) FROM tester_feedback_screenshots s WHERE s.feedback_id=f.id) screenshotCount
    FROM tester_feedback f JOIN "user" u ON u.id=f.user_id JOIN households h ON h.id=f.household_id
    ORDER BY CASE COALESCE(f.priority,'normal') WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, f.created_at DESC LIMIT 250`).all();
  return c.json({items:rows.results});
});

app.patch("/api/v1/admin/feedback/:feedbackId", async c => {
  const access=await requirePlatformAdmin(c); if(access.response)return access.response;
  const body=await c.req.json().catch(()=>null) as any;
  const statuses=["new","reviewing","planned","fixed","closed"]; const priorities=["low","normal","high","critical"];
  if(!statuses.includes(body?.status)||!priorities.includes(body?.priority))return apiError(c,422,"VALIDATION_FAILED","Choose a valid status and priority.");
  await c.env.DB.prepare("UPDATE tester_feedback SET status=?, priority=? WHERE id=?").bind(body.status,body.priority,c.req.param("feedbackId")).run();
  return c.json({ok:true});
});

app.get("/api/v1/admin/feedback/:feedbackId/screenshots", async c => {
  const access=await requirePlatformAdmin(c); if(access.response)return access.response;
  const rows=await c.env.DB.prepare("SELECT id,file_name fileName,mime_type mimeType,data_base64 dataBase64 FROM tester_feedback_screenshots WHERE feedback_id=? ORDER BY created_at").bind(c.req.param("feedbackId")).all();
  return c.json({items:rows.results});
});

export default app;