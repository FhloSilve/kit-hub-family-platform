import { describe, expect, it } from "vitest";
import { resolveAuthOrigins } from "./auth";

describe("resolveAuthOrigins", () => {
  it("uses the configured production origin instead of trusting the request host", () => {
    const result = resolveAuthOrigins(
      new Request("https://untrusted.example/api/auth/session"),
      "https://kit-hub-family-platform.scarletsilverfox.workers.dev/path",
    );

    expect(result).toEqual({
      authOrigin: "https://kit-hub-family-platform.scarletsilverfox.workers.dev",
      trustedOrigins: ["https://kit-hub-family-platform.scarletsilverfox.workers.dev"],
    });
  });

  it.each(["localhost", "127.0.0.1"])("allows the local development host %s", (hostname) => {
    const result = resolveAuthOrigins(
      new Request(`http://${hostname}:5173/api/auth/session`),
      "https://kit-hub-family-platform.scarletsilverfox.workers.dev",
    );

    expect(result).toEqual({
      authOrigin: `http://${hostname}:5173`,
      trustedOrigins: [`http://${hostname}:5173`],
    });
  });
});
