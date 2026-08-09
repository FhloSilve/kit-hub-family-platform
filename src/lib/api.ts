import type {
  ApiErrorBody,
  BootstrapResponse,
  CreateEventInput,
  CreateGroceryItemInput,
  CreateHouseholdInput,
  CreateTaskInput,
  EverydayCoreResponse,
  EverydayTask,
  GroceryItem,
  HouseholdEvent,
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

function householdUrl(householdId: string, path: string) {
  return `/api/v1/households/${encodeURIComponent(householdId)}/${path}`;
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
  everydayCore: (householdId: string) => request<EverydayCoreResponse>(householdUrl(householdId, "everyday")),
  createTask: (householdId: string, input: CreateTaskInput) =>
    request<EverydayTask>(householdUrl(householdId, "tasks"), { method: "POST", body: JSON.stringify(input) }),
  setTaskDone: (householdId: string, taskId: string, done: boolean) =>
    request<EverydayTask>(householdUrl(householdId, `tasks/${encodeURIComponent(taskId)}`), {
      method: "PATCH",
      body: JSON.stringify({ status: done ? "done" : "todo" }),
    }),
  createGroceryItem: (householdId: string, input: CreateGroceryItemInput) =>
    request<GroceryItem>(householdUrl(householdId, "groceries"), { method: "POST", body: JSON.stringify(input) }),
  setGroceryChecked: (householdId: string, itemId: string, checked: boolean) =>
    request<GroceryItem>(householdUrl(householdId, `groceries/${encodeURIComponent(itemId)}`), {
      method: "PATCH",
      body: JSON.stringify({ checked }),
    }),
  createEvent: (householdId: string, input: CreateEventInput) =>
    request<HouseholdEvent>(householdUrl(householdId, "events"), { method: "POST", body: JSON.stringify(input) }),
};
