import { Hono } from "hono";
import { createAuth } from "./auth";
import { isPlatformAdmin, requirePlatformAdmin } from "./admin";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
const journeyEvents = new Set(["welcome_seen", "silvi_tried", "feedback_prompt_dismissed"]);

async function currentTester(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { error: apiError(c, 401, "AUTH_REQUIRED", "Sign in to continue.") } as const;
  if (isPlatformAdmin(c.env, session.user.email)) return { session, tester: null } as const;
  const tester = await c.env.DB.prepare(
    "SELECT email,status,invited_at invitedAt,activated_at activatedAt FROM beta_tester_allowlist WHERE lower(email)=lower(?) LIMIT 1",
  ).bind(session.user.email).first<{email:string;status:string;invitedAt:string;activatedAt:string|null}>();
  return { session, tester } as const;
}

async function journeyFor(c: Ctx, email: string, userId: string) {
  const [row, membership, sharedAction, silviProposal, silviUsage, feedback] = await Promise.all([
    c.env.DB.prepare("SELECT welcome_seen_at welcomeSeenAt,silvi_tried_at silviTriedAt,feedback_prompt_dismissed_at feedbackPromptDismissedAt FROM beta_tester_journey WHERE lower(email)=lower(?)").bind(email).first<any>().catch(()=>null),
    c.env.DB.prepare("SELECT household_id householdId FROM memberships WHERE user_id=? AND status='active' ORDER BY created_at ASC LIMIT 1").bind(userId).first<{householdId:string}>().catch(()=>null),
    c.env.DB.prepare(`SELECT 1 found FROM (
      SELECT created_by actor FROM everyday_tasks WHERE created_by=?
      UNION ALL SELECT added_by actor FROM everyday_grocery_items WHERE added_by=?
      UNION ALL SELECT created_by actor FROM everyday_events WHERE created_by=?
      UNION ALL SELECT created_by actor FROM meal_plans WHERE created_by=?
    ) LIMIT 1`).bind(userId,userId,userId,userId).first().catch(()=>null),
    c.env.DB.prepare("SELECT 1 found FROM silvi_action_proposals WHERE user_id=? LIMIT 1").bind(userId).first().catch(()=>null),
    c.env.DB.prepare("SELECT 1 found FROM product_usage_daily p JOIN memberships m ON m.household_id=p.household_id WHERE m.user_id=? AND m.status='active' AND p.event_key='silvi_opened' LIMIT 1").bind(userId).first().catch(()=>null),
    c.env.DB.prepare("SELECT 1 found FROM tester_feedback WHERE user_id=? LIMIT 1").bind(userId).first().catch(()=>null),
  ]);
  const welcomeSeen = Boolean(row?.welcomeSeenAt);
  const householdReady = Boolean(membership?.householdId);
  const sharedActionDone = Boolean(sharedAction);
  const silviTried = Boolean(row?.silviTriedAt || silviProposal || silviUsage);
  const feedbackSubmitted = Boolean(feedback);
  const completed = [true,householdReady,sharedActionDone,silviTried,feedbackSubmitted].filter(Boolean).length;
  return {
    welcomeSeen,
    householdReady,
    sharedActionDone,
    silviTried,
    feedbackSubmitted,
    feedbackPromptDismissed: Boolean(row?.feedbackPromptDismissedAt),
    completed,
    total: 5,
    percent: Math.round((completed / 5) * 100),
    showFeedbackPrompt: welcomeSeen && householdReady && sharedActionDone && silviTried && !feedbackSubmitted && !row?.feedbackPromptDismissedAt,
  };
}

app.get("/api/v1/beta-journey", async c => {
  const access = await currentTester(c);
  if ("error" in access) return access.error;
  if (!access.tester || !["invited","active"].includes(access.tester.status)) return c.json({ eligible:false });
  const journey = await journeyFor(c, access.tester.email, access.session.user.id);
  return c.json({ eligible:true, tester:{status:access.tester.status,invitedAt:access.tester.invitedAt,activatedAt:access.tester.activatedAt}, journey });
});

app.post("/api/v1/beta-journey/event", async c => {
  const access = await currentTester(c);
  if ("error" in access) return access.error;
  if (!access.tester || !["invited","active"].includes(access.tester.status)) return apiError(c,403,"BETA_TESTER_REQUIRED","This first-session journey is only available to approved beta testers.");
  const body = await c.req.json().catch(()=>null) as {event?:unknown}|null;
  const event = typeof body?.event === "string" ? body.event : "";
  if (!journeyEvents.has(event)) return apiError(c,422,"BETA_JOURNEY_EVENT_INVALID","That beta journey event is not supported.");
  const column = event==="welcome_seen"?"welcome_seen_at":event==="silvi_tried"?"silvi_tried_at":"feedback_prompt_dismissed_at";
  await c.env.DB.prepare(`INSERT INTO beta_tester_journey(email,${column},updated_at) VALUES(?,datetime('now'),datetime('now')) ON CONFLICT(email) DO UPDATE SET ${column}=COALESCE(beta_tester_journey.${column},datetime('now')),updated_at=datetime('now')`).bind(access.tester.email).run();
  return c.json({ recorded:true, event });
});

app.get("/api/v1/admin/beta-journey", async c => {
  const admin = await requirePlatformAdmin(c); if (admin.response) return admin.response;
  const rows = await c.env.DB.prepare(`SELECT
      b.email,b.display_name displayName,b.status,b.invited_at invitedAt,b.activated_at activatedAt,
      j.welcome_seen_at welcomeSeenAt,j.silvi_tried_at silviTriedAt,j.feedback_prompt_dismissed_at feedbackPromptDismissedAt,
      u.id userId,
      EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active') householdReady,
      (EXISTS(SELECT 1 FROM everyday_tasks t WHERE t.created_by=u.id)
        OR EXISTS(SELECT 1 FROM everyday_grocery_items g WHERE g.added_by=u.id)
        OR EXISTS(SELECT 1 FROM everyday_events e WHERE e.created_by=u.id)
        OR EXISTS(SELECT 1 FROM meal_plans mp WHERE mp.created_by=u.id)) sharedActionDone,
      EXISTS(SELECT 1 FROM silvi_action_proposals s WHERE s.user_id=u.id) silviProposal,
      EXISTS(SELECT 1 FROM product_usage_daily p JOIN memberships m2 ON m2.household_id=p.household_id WHERE m2.user_id=u.id AND m2.status='active' AND p.event_key='silvi_opened') silviUsage,
      EXISTS(SELECT 1 FROM tester_feedback f WHERE f.user_id=u.id) feedbackSubmitted
    FROM beta_tester_allowlist b
    LEFT JOIN beta_tester_journey j ON lower(j.email)=lower(b.email)
    LEFT JOIN "user" u ON lower(u.email)=lower(b.email)
    ORDER BY b.invited_at DESC`).all<any>();
  const testers = rows.results.map((r:any)=>{
    const signedIn=Boolean(r.activatedAt),householdReady=Boolean(r.householdReady),sharedActionDone=Boolean(r.sharedActionDone),silviTried=Boolean(r.silviTriedAt||r.silviProposal||r.silviUsage),feedbackSubmitted=Boolean(r.feedbackSubmitted),welcomeSeen=Boolean(r.welcomeSeenAt);
    const completed=[signedIn,householdReady,sharedActionDone,silviTried,feedbackSubmitted].filter(Boolean).length;
    return {...r,signedIn,householdReady,sharedActionDone,silviTried,feedbackSubmitted,welcomeSeen,completed,total:5,percent:Math.round((completed/5)*100)};
  });
  return c.json({testers,summary:{invited:testers.length,activated:testers.filter((t:any)=>t.signedIn).length,householdReady:testers.filter((t:any)=>t.householdReady).length,firstAction:testers.filter((t:any)=>t.sharedActionDone).length,silviTried:testers.filter((t:any)=>t.silviTried).length,feedback:testers.filter((t:any)=>t.feedbackSubmitted).length}});
});

export default app;
