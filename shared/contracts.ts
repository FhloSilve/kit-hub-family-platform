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
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  households: HouseholdSummary[];
  activeHousehold: HouseholdSummary | null;
}

export interface CreateHouseholdInput {
  name: string;
  timezone: string;
  defaultLanguage: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, string>;
  };
}
