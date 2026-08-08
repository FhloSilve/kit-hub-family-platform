import type {
  ApiErrorBody,
  BootstrapResponse,
  CreateHouseholdInput,
  HouseholdSummary,
} from "../../shared/contracts";

export class ApiError extends Error {
  code: string;
  details?: Record<string, string>;

  constructor(body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json()) as ApiErrorBody;
    throw new ApiError(body);
  }

  return (await response.json()) as T;
}

export const api = {
  bootstrap: () => request<BootstrapResponse>("/api/v1/bootstrap"),
  createHousehold: (input: CreateHouseholdInput) =>
    request<HouseholdSummary>("/api/v1/households", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
