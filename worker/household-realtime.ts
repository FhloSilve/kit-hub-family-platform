import { DurableObject } from "cloudflare:workers";

/**
 * Compatibility export for the existing production Durable Object namespace.
 *
 * Realtime features are intentionally not exposed by Milestone 1 yet. Keeping
 * this class exported preserves the namespace (and any stored state) while the
 * rest of the application foundation is deployed.
 */
export class HouseholdRealtime extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return Response.json(
      {
        error: "REALTIME_NOT_AVAILABLE",
        message: "Household realtime features are not available in this milestone.",
      },
      { status: 503 },
    );
  }
}
