import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

async function userFor(c:Ctx){
  const session = await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
  return session?.user ?? null;
}
async function membership(c:Ctx,householdId:string,userId:string){
  return c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,userId).first<{role:string}>();
}
async function canManage(c:Ctx,householdId:string,userId:string){
  const member=await membership(c,householdId,userId);if(!member)return false;
  const override=await c.env.DB.prepare("SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key='calendar.manage'").bind(householdId,userId).first<{effect:string}>();
  if(override)return override.effect==='allow';
  const permission=await c.env.DB.prepare("SELECT effect FROM role_permissions WHERE role_key=? AND permission_key='calendar.manage'").bind(member.role).first<{effect:string}>();
  return permission?.effect==='allow';
}

app.get('/api/v1/households/:householdId/events/:eventId/details',async c=>{
  const user=await userFor(c);if(!user)return apiError(c,401,'AUTH_REQUIRED','Sign in to open this event.');
  const householdId=c.req.param('householdId'),eventId=c.req.param('eventId');
  if(!(await membership(c,householdId,user.id)))return apiError(c,403,'HOUSEHOLD_VIEW_REQUIRED','You do not have access to this household.');
  const event=await c.env.DB.prepare(`SELECT id,title,description,location,starts_at startsAt,ends_at endsAt,all_day allDay,event_type eventType,recurrence,reminder_minutes reminderMinutes FROM everyday_events WHERE id=? AND household_id=?`).bind(eventId,householdId).first<any>();
  if(!event)return apiError(c,404,'EVENT_NOT_FOUND','That calendar event could not be found.');
  const [members,attendees]=await Promise.all([
    c.env.DB.prepare(`SELECT m.user_id userId,u.name,m.role_key role FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(householdId).all<any>(),
    c.env.DB.prepare(`SELECT a.user_id userId,u.name FROM calendar_event_attendees a JOIN "user" u ON u.id=a.user_id WHERE a.household_id=? AND a.event_id=? ORDER BY u.name`).bind(householdId,eventId).all<any>()
  ]);
  return c.json({event:{...event,allDay:Boolean(event.allDay)},members:members.results,attendees:attendees.results,canManage:await canManage(c,householdId,user.id)});
});

app.put('/api/v1/households/:householdId/events/:eventId/attendees',async c=>{
  const user=await userFor(c);if(!user)return apiError(c,401,'AUTH_REQUIRED','Sign in to update attendees.');
  const householdId=c.req.param('householdId'),eventId=c.req.param('eventId');
  if(!(await canManage(c,householdId,user.id)))return apiError(c,403,'CALENDAR_MANAGE_REQUIRED','You do not have permission to manage the calendar.');
  const event=await c.env.DB.prepare('SELECT id FROM everyday_events WHERE id=? AND household_id=?').bind(eventId,householdId).first();
  if(!event)return apiError(c,404,'EVENT_NOT_FOUND','That calendar event could not be found.');
  const body=await c.req.json().catch(()=>null) as any;
  const ids=Array.isArray(body?.userIds)?Array.from(new Set(body.userIds.filter((x:unknown)=>typeof x==='string'&&x).slice(0,50))) as string[]:[];
  if(ids.length){
    const placeholders=ids.map(()=>'?').join(',');
    const rows=await c.env.DB.prepare(`SELECT user_id userId FROM memberships WHERE household_id=? AND status='active' AND user_id IN (${placeholders})`).bind(householdId,...ids).all<any>();
    if(rows.results.length!==ids.length)return apiError(c,422,'ATTENDEE_NOT_MEMBER','Every attendee must be an active household member.');
  }
  const statements=[c.env.DB.prepare('DELETE FROM calendar_event_attendees WHERE household_id=? AND event_id=?').bind(householdId,eventId),...ids.map(id=>c.env.DB.prepare('INSERT INTO calendar_event_attendees(event_id,household_id,user_id,added_by) VALUES(?,?,?,?)').bind(eventId,householdId,id,user.id))];
  await c.env.DB.batch(statements);
  const attendees=await c.env.DB.prepare(`SELECT a.user_id userId,u.name FROM calendar_event_attendees a JOIN "user" u ON u.id=a.user_id WHERE a.household_id=? AND a.event_id=? ORDER BY u.name`).bind(householdId,eventId).all<any>();
  return c.json({attendees:attendees.results});
});

export default app;
