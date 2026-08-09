import type {
  ApiErrorBody,
  BootstrapResponse,
  CreateHouseholdInput,
  HouseholdSummary,
  UpdateHouseholdInput,
  UpdateHouseholdResponse,
} from "../../shared/contracts";

export class ApiError extends Error {
  code: string;
  details?: Record<string, string>;
  requestId?: string;

  constructor(body: ApiErrorBody, requestId?: string) {
    super(body.error.message);
    this.name = "ApiError";
    this.code = body.error.code;
    this.details = body.error.details;
    this.requestId = body.error.requestId ?? requestId;
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
    const requestId = response.headers.get("x-request-id") ?? undefined;
    try {
      const body = (await response.json()) as ApiErrorBody;
      throw new ApiError(body, requestId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        {
          error: {
            code: "UNEXPECTED_RESPONSE",
            message: "Kit Hub returned an unexpected response. Please try again.",
            requestId: requestId ?? "unavailable",
          },
        },
        requestId,
      );
    }
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
  updateHousehold: (householdId: string, input: UpdateHouseholdInput) =>
    request<UpdateHouseholdResponse>(`/api/v1/households/${encodeURIComponent(householdId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
