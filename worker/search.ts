import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

async function access(c:Ctx, householdId?:string){
  const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
  if(!session?.user)return {response:apiError(c,401,"AUTH_REQUIRED","Sign in to continue.")};
  if(!householdId)return {user:session.user};
  const member=await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,session.user.id).first();
  if(!member)return {response:apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.")};
  return {user:session.user};
}

function language(c:Ctx){const raw=(c.req.header("accept-language")||"en").split(",")[0]||"en";const code=raw.split("-")[0]?.trim().toLowerCase();return code&&/^[a-z]{2}$/.test(code)?code:"en";}

app.get("/api/v1/places/autocomplete",async c=>{
  const a=await access(c); if("response" in a)return a.response;
  const q=(c.req.query("q")||"").trim();
  if(q.length<3)return c.json({results:[]});
  const apiKey=c.env.GEOAPIFY_API_KEY?.trim();
  if(!apiKey)return apiError(c,500,"PLACE_SEARCH_NOT_CONFIGURED","Place suggestions are not configured yet. Add the GEOAPIFY_API_KEY Worker secret, then run Sync + release + verify again.");
  const url=new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text",q.slice(0,180));
  url.searchParams.set("format","json");
  url.searchParams.set("limit","6");
  url.searchParams.set("apiKey",apiKey);
  url.searchParams.set("lang",language(c));
  let response:Response;
  try{response=await fetch(url.toString(),{headers:{accept:"application/json"}})}catch{return apiError(c,500,"PLACE_SEARCH_NETWORK_FAILED","Kit Hub could not reach Geoapify. Try place suggestions again in a moment.")}
  if(!response.ok){
    if(response.status===400)return apiError(c,500,"PLACE_SEARCH_REQUEST_REJECTED","Geoapify rejected the place-search request. Kit Hub will keep the location field available for manual entry.");
    if(response.status===401||response.status===403)return apiError(c,500,"PLACE_SEARCH_KEY_REJECTED","Geoapify rejected the configured API key. Check the GEOAPIFY_API_KEY Worker secret and its Geoapify restrictions.");
    if(response.status===429)return apiError(c,500,"PLACE_SEARCH_RATE_LIMITED","Geoapify is temporarily rate-limiting place suggestions. Try again shortly.");
    return apiError(c,500,"PLACE_SEARCH_FAILED","Place suggestions are temporarily unavailable.");
  }
  const body=await response.json().catch(()=>({results:[]})) as any;
  const results=(Array.isArray(body.results)?body.results:[]).slice(0,6).map((item:any)=>({
    id:String(item.place_id||`${item.lat},${item.lon}`),
    label:String(item.formatted||item.address_line1||item.name||"").slice(0,240),
    name:String(item.name||item.address_line1||item.formatted||"").slice(0,160),
    latitude:Number(item.lat),longitude:Number(item.lon),
    city:item.city||item.town||item.village||null,country:item.country||null,
  })).filter((item:any)=>item.label&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
  return c.json({results});
});

app.get("/api/v1/places/reverse",async c=>{
  const a=await access(c);if("response" in a)return a.response;
  const lat=Number(c.req.query("lat")),lon=Number(c.req.query("lon"));
  if(!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180)return apiError(c,422,"INVALID_LOCATION","Kit Hub could not label that shared location.");
  const apiKey=c.env.GEOAPIFY_API_KEY?.trim();
  if(!apiKey)return c.json({label:null,city:null,country:null});
  const url=new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat",String(lat));url.searchParams.set("lon",String(lon));url.searchParams.set("format","json");url.searchParams.set("limit","1");url.searchParams.set("lang",language(c));url.searchParams.set("apiKey",apiKey);
  try{
    const response=await fetch(url.toString(),{headers:{accept:"application/json"}});if(!response.ok)return c.json({label:null,city:null,country:null});
    const body=await response.json().catch(()=>({results:[]})) as any;const item=Array.isArray(body.results)?body.results[0]:null;
    if(!item)return c.json({label:null,city:null,country:null});
    const city=String(item.city||item.town||item.village||item.county||"").trim()||null;const country=String(item.country||"").trim()||null;
    const label=String(city&&country?`${city}, ${country}`:city||country||item.formatted||"").trim().slice(0,180)||null;
    return c.json({label,city,country});
  }catch{return c.json({label:null,city:null,country:null});}
});

app.get("/api/v1/households/:householdId/search",async c=>{
  const h=c.req.param("householdId"),a=await access(c,h); if("response" in a)return a.response;
  const q=(c.req.query("q")||"").trim(); if(q.length<2)return c.json({results:[]});
  const like=`%${q.replace(/[%_]/g," ")}%`;
  const statements=[
    c.env.DB.prepare("SELECT id,'event' kind,title title,COALESCE(location,description,'') subtitle,starts_at sortAt FROM everyday_events WHERE household_id=? AND (title LIKE ? OR description LIKE ? OR location LIKE ?) ORDER BY starts_at DESC LIMIT 8").bind(h,like,like,like),
    c.env.DB.prepare("SELECT id,'task' kind,title title,COALESCE(notes,'') subtitle,due_at sortAt FROM everyday_tasks WHERE household_id=? AND (title LIKE ? OR notes LIKE ?) ORDER BY updated_at DESC LIMIT 8").bind(h,like,like),
    c.env.DB.prepare("SELECT id,'grocery' kind,name title,quantity subtitle,created_at sortAt FROM everyday_grocery_items WHERE household_id=? AND name LIKE ? ORDER BY updated_at DESC LIMIT 6").bind(h,like),
    c.env.DB.prepare("SELECT id,'meal' kind,title title,COALESCE(notes,meal_type) subtitle,meal_date sortAt FROM meal_plans WHERE household_id=? AND (title LIKE ? OR notes LIKE ?) ORDER BY meal_date DESC LIMIT 6").bind(h,like,like),
    c.env.DB.prepare("SELECT id,'recipe' kind,name title,COALESCE(description,'Recipe') subtitle,updated_at sortAt FROM meal_recipes WHERE household_id=? AND (name LIKE ? OR description LIKE ? OR instructions LIKE ?) ORDER BY updated_at DESC LIMIT 6").bind(h,like,like,like),
    c.env.DB.prepare("SELECT id,'note' kind,substr(body,1,100) title,'Family note' subtitle,updated_at sortAt FROM family_notes WHERE household_id=? AND body LIKE ? ORDER BY updated_at DESC LIMIT 6").bind(h,like),
    c.env.DB.prepare("SELECT id,'message' kind,substr(body,1,100) title,'Family Hub message' subtitle,created_at sortAt FROM household_messages WHERE household_id=? AND body LIKE ? ORDER BY created_at DESC LIMIT 6").bind(h,like),
    c.env.DB.prepare("SELECT id,'announcement' kind,title title,substr(body,1,120) subtitle,updated_at sortAt FROM household_announcements WHERE household_id=? AND (title LIKE ? OR body LIKE ?) ORDER BY updated_at DESC LIMIT 6").bind(h,like,like),
    c.env.DB.prepare("SELECT id,'routine' kind,title title,COALESCE(notes,cadence) subtitle,next_due_at sortAt FROM household_routines WHERE household_id=? AND active=1 AND (title LIKE ? OR notes LIKE ?) ORDER BY updated_at DESC LIMIT 6").bind(h,like,like),
    c.env.DB.prepare("SELECT m.user_id id,'member' kind,u.name title,u.email subtitle,m.joined_at sortAt FROM memberships m JOIN user u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' AND (u.name LIKE ? OR u.email LIKE ?) ORDER BY u.name LIMIT 6").bind(h,like,like),
  ];
  const batches=await c.env.DB.batch(statements);
  const results=batches.flatMap((batch:any)=>batch.results||[]).slice(0,40);
  return c.json({results});
});

export default app;
