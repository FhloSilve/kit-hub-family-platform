export type HouseholdRole = "owner" | "admin" | "adult" | "teen" | "child" | "guest";

export interface HouseholdSummary {
  id: string;
  name: string;
  slug: string;
  role: HouseholdRole;
  memberCount: number;
  defaultLanguage: string;
  timezone: string;
  theme: string;
}

export interface BootstrapResponse {
  user: { id: string; name: string; email: string; image: string | null; };
  households: HouseholdSummary[];
  activeHousehold: HouseholdSummary | null;
}

export interface CreateHouseholdInput { name: string; timezone: string; defaultLanguage: string; }
export interface UpdateHouseholdInput { name: string; }
export interface UpdateHouseholdResponse { id: string; name: string; }
export interface ApiErrorBody { error: { code: string; message: string; requestId: string; details?: Record<string, string>; }; }
export interface AppVersionResponse { id: string; tag: string | null; timestamp: string | null; }

export interface AdminReleaseStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}
export interface AdminReleaseRun {
  id: number; name: string; status: string; conclusion: string | null; headBranch: string;
  htmlUrl: string | null; createdAt: string | null; updatedAt: string | null; steps: AdminReleaseStep[];
}
export interface AdminReleaseStatusResponse {
  releaseConfigured: boolean; repository: string | null; workflow: string | null;
  deployedVersion: AppVersionResponse; latestRun: AdminReleaseRun | null;
}
export interface AdminReleaseDispatchResponse { accepted: boolean; message: string; }

export interface HouseholdMemberSummary {
  id: string; userId: string; name: string; email: string; role: HouseholdRole; joinedAt: string | null;
}
export interface EverydayTask {
  id: string; title: string; notes: string | null; status: "todo" | "done"; priority: "low" | "normal" | "high";
  dueAt: string | null; assigneeUserId: string | null; assigneeName: string | null; createdAt: string;
}
export interface GroceryItem { id: string; name: string; quantity: string; checked: boolean; createdAt: string; }
export interface HouseholdEvent {
  id: string; title: string; description: string | null; location: string | null; startsAt: string; endsAt: string | null; allDay: boolean; createdAt: string;
}
export interface EverydayCoreResponse {
  members: HouseholdMemberSummary[]; tasks: EverydayTask[]; groceries: GroceryItem[]; events: HouseholdEvent[];
}
export interface CreateTaskInput {
  title: string; notes?: string; priority?: "low" | "normal" | "high"; dueAt?: string | null; assigneeUserId?: string | null;
}
export interface CreateGroceryItemInput { name: string; quantity?: string; }
export interface CreateEventInput {
  title: string; description?: string; location?: string; startsAt: string; endsAt?: string | null; allDay?: boolean;
}
