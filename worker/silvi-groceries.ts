import { Hono } from "hono";
import { createAuth } from "./auth";
import { recordHouseholdActivity } from "./activity";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Access = { user:{id:string;name?:string|null}; householdId:string } | { response:ReturnType<typeof apiError> };
type Grocery = { id:string; name:string; quantity:string; checked:number|boolean; store:string|null };

function clean(value:unknown,max=180){return typeof value==="string"?value.trim().slice(0,max):""}
async function access(c:Ctx):Promise<Access>{
  const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
  if(!session?.user)return{response:apiError(c,401,"AUTH_REQUIRED","Sign in to ask Silvi about groceries.")};
  const householdId=c.req.param("householdId")??"";
  const member=householdId?await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,session.user.id).first():null;
  if(!member)return{response:apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.")};
  return{user:session.user,householdId};
}
async function canManage(c:Ctx,householdId:string,userId:string){
  const membership=await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,userId).first<{role:string}>();
  if(!membership)return false;
  const override=await c.env.DB.prepare("SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key='groceries.manage' LIMIT 1").bind(householdId,userId).first<{effect:string}>();
  if(override)return override.effect==="allow";
  const permission=await c.env.DB.prepare("SELECT effect FROM role_permissions WHERE role_key=? AND permission_key='groceries.manage' LIMIT 1").bind(membership.role).first<{effect:string}>();
  return permission?.effect==="allow";
}
function normalizeName(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function titleCase(value:string){return value.replace(/\b\w/g,m=>m.toUpperCase())}
function parseNeed(question:string){
  const original=question.trim(); const q=original.toLowerCase();
  if(!/(need|buy|pick up|get|add).*(food|chicken|milk|bread|eggs|grocer|shopping|supermarket|store|from|at)|(?:we|i) need\b/.test(q))return null;
  let item=original.replace(/^(?:please\s+)?(?:(?:we|i)\s+)?(?:really\s+)?(?:need|want|have to buy|should buy|buy|get|pick up|add)\s+/i,"");
  let store:string|null=null;
  const storeMatch=item.match(/(?:\bthe\s+ones?\s+)?\b(?:from|at)\s+([A-Za-z0-9&' .-]{2,50})[.!?]?$/i);
  if(storeMatch){store=clean(storeMatch[1],50).replace(/[.!?]+$/g,"").trim();item=item.slice(0,storeMatch.index).replace(/[,.\s]+$/g,"").trim()}
  item=item.replace(/^(?:some|a|an|the)\s+/i,"").replace(/[.!?]+$/g,"").trim();
  if(/^general groceries$/i.test(item)||/^groceries$/i.test(item))return null;
  const general=/\bgeneral groceries\b/i.test(original); if(general){store=null;item=item.replace(/\s+(?:to|in)\s+general groceries.*$/i,"").trim()}
  if(!item||item.length>120)return null;
  return{item,store,general};
}
async function groceries(c:Ctx,householdId:string){return c.env.DB.prepare("SELECT id,name,quantity,checked,store FROM everyday_grocery_items WHERE household_id=? ORDER BY checked,created_at DESC").bind(householdId).all<Grocery>()}
function duplicate(item:string,rows:Grocery[]){const wanted=normalizeName(item);return rows.find(row=>!Boolean(row.checked)&&(normalizeName(row.name)===wanted||normalizeName(row.name).includes(wanted)||wanted.includes(normalizeName(row.name))))}

app.post("/api/v1/households/:householdId/silvi/ask",async(c,next)=>{
  const body=await c.req.json().catch(()=>null) as {question?:unknown}|null; const question=clean(body?.question,700); const parsed=parseNeed(question);
  if(!parsed)return next();
  const a=await access(c);if("response" in a)return a.response;
  const list=await groceries(c,a.householdId); const existing=duplicate(parsed.item,list.results);
  if(existing){const where=existing.store?` for ${existing.store}`:" in General Groceries";return c.json({answer:`“${existing.name}” is already on the shopping list${where}, so I won't add a duplicate.`,followUps:["Show me the grocery list","Mark it as bought","Add something else"],generatedAt:new Date().toISOString(),requiresConfirmation:false,source:"kit-hub"})}
  if(!parsed.store&&!parsed.general){
    const known=[...new Set(list.results.map(x=>x.store).filter((x):x is string=>Boolean(x)))].slice(0,3);
    return c.json({answer:`“${parsed.item}” isn't on the shopping list yet. Which store should I use? If the store doesn't matter, I can put it in General Groceries.`,followUps:[`Add ${parsed.item} to general groceries`,...known.map(store=>`Add ${parsed.item} from ${store}`)],generatedAt:new Date().toISOString(),requiresConfirmation:false,source:"kit-hub"});
  }
  if(!(await canManage(c,a.householdId,a.user.id)))return c.json({answer:`“${parsed.item}” isn't on the list, but you don't currently have permission to add groceries.`,followUps:["Show me the grocery list"],generatedAt:new Date().toISOString(),requiresConfirmation:false,source:"kit-hub"});
  const id=crypto.randomUUID(),expiresAt=new Date(Date.now()+10*60*1000).toISOString(),name=titleCase(parsed.item),payload={name,quantity:"1",store:parsed.store};
  const summary=parsed.store?`Add “${name}” to Groceries for ${parsed.store}.`:`Add “${name}” to General Groceries.`;
  await c.env.DB.prepare("INSERT INTO silvi_action_proposals(id,household_id,user_id,action_type,summary,payload_json,expires_at) VALUES(?,?,?,?,?,?,?)").bind(id,a.householdId,a.user.id,"grocery.create",summary,JSON.stringify(payload),expiresAt).run();
  return c.json({answer:`I checked the shopping list and “${name}” isn't there. I can add it${parsed.store?` for ${parsed.store}`:" to General Groceries"} after you approve the change below.`,proposal:{id,type:"grocery.create",summary,payload,expiresAt},followUps:["Show me the grocery list"],generatedAt:new Date().toISOString(),requiresConfirmation:true,source:"kit-hub"});
});

app.post("/api/v1/households/:householdId/silvi/actions/:proposalId/confirm",async(c,next)=>{
  const a=await access(c);if("response" in a)return a.response;
  const row=await c.env.DB.prepare("SELECT id,action_type actionType,payload_json payloadJson,status,expires_at expiresAt FROM silvi_action_proposals WHERE id=? AND household_id=? AND user_id=?").bind(c.req.param("proposalId"),a.householdId,a.user.id).first<{id:string;actionType:string;payloadJson:string;status:string;expiresAt:string}>();
  if(!row||row.actionType!=="grocery.create")return next();
  const body=await c.req.json().catch(()=>null) as {confirm?:unknown}|null;if(body?.confirm!==true)return apiError(c,422,"CONFIRMATION_REQUIRED","Confirm this grocery change before applying it.");
  if(row.status!=="pending")return apiError(c,409,"SILVI_PROPOSAL_USED","That Silvi proposal is no longer waiting for confirmation.");
  if(Date.parse(row.expiresAt)<=Date.now()){await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='cancelled' WHERE id=?").bind(row.id).run();return apiError(c,409,"SILVI_PROPOSAL_EXPIRED","That Silvi proposal expired. Ask Silvi again so it can check the latest shopping list.")}
  if(!(await canManage(c,a.householdId,a.user.id)))return apiError(c,403,"GROCERIES_MANAGE_REQUIRED","You do not have permission to manage groceries.");
  const payload=JSON.parse(row.payloadJson) as {name?:unknown;quantity?:unknown;store?:unknown};const name=clean(payload.name,120),quantity=clean(payload.quantity,40)||"1",store=clean(payload.store,50)||null;if(!name)return apiError(c,422,"VALIDATION_FAILED","That grocery item is no longer valid.");
  const list=await groceries(c,a.householdId);const exists=duplicate(name,list.results);if(exists){await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='completed',executed_at=datetime('now') WHERE id=?").bind(row.id).run();return c.json({result:`“${exists.name}” is already on the shopping list, so I did not add a duplicate.`,followUps:["Show me the grocery list"]})}
  await c.env.DB.prepare("INSERT INTO everyday_grocery_items(id,household_id,name,quantity,checked,important,added_by,store) VALUES(?,?,?,?,0,0,?,?)").bind(crypto.randomUUID(),a.householdId,name,quantity,a.user.id,store).run();
  await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='completed',executed_at=datetime('now') WHERE id=?").bind(row.id).run();
  await recordHouseholdActivity(c,a.householdId,a.user.id,"grocery.add",`${a.user.name??"A household member"} asked Silvi to add ${name}${store?` for ${store}`:" to General Groceries"}.`);
  return c.json({result:`Added “${name}”${store?` for ${store}`:" to General Groceries"}.`,followUps:["Show me the grocery list","Add another grocery item"]});
});

app.post("/api/v1/households/:householdId/silvi/actions/:proposalId/cancel",async(c,next)=>{
  const a=await access(c);if("response" in a)return a.response;
  const row=await c.env.DB.prepare("SELECT action_type actionType FROM silvi_action_proposals WHERE id=? AND household_id=? AND user_id=?").bind(c.req.param("proposalId"),a.householdId,a.user.id).first<{actionType:string}>();
  if(!row||row.actionType!=="grocery.create")return next();
  const result=await c.env.DB.prepare("UPDATE silvi_action_proposals SET status='cancelled' WHERE id=? AND household_id=? AND user_id=? AND status='pending'").bind(c.req.param("proposalId"),a.householdId,a.user.id).run();if(!result.meta.changes)return apiError(c,409,"SILVI_PROPOSAL_NOT_PENDING","That grocery proposal is no longer waiting for a decision.");return c.json({cancelled:true});
});

export default app;
