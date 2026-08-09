import type { Context } from "hono";
import type { ApiErrorBody } from "../shared/contracts";

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
  };
};

export function apiError(
  c: Context<AppBindings>,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
  code: string,
  message: string,
  details?: Record<string, string>,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      requestId: c.get("requestId"),
      ...(details ? { details } : {}),
    },
  };

  return c.json(body, status);
}
