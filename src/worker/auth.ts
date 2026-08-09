import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "../db/schema";
import type { Bindings } from "./types";

export function createAuth(env: Bindings, origin: string) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters");
  }

  const db = drizzle(env.DB, { schema: authSchema });

  return betterAuth({
    appName: "Kit Hub",
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      cookiePrefix: "kit-hub",
      useSecureCookies: origin.startsWith("https://"),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
