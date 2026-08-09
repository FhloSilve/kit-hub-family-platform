export type Bindings = Env & {
  BETTER_AUTH_SECRET: string;
};

export type HouseholdRole = "owner" | "admin" | "member" | "child";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type HouseholdMembership = {
  householdId: string;
  householdName: string;
  householdSlug: string;
  memberId: string;
  role: HouseholdRole;
  displayName: string;
};
