import { betterAuth } from "better-auth";

export function createAuth(env: Env, request: Request) {
  const origin = new URL(request.url).origin;

  return betterAuth({
    appName: "Kit Hub",
    baseURL: origin,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      deferSessionRefresh: true,
    },
    advanced: {
      cookiePrefix: "kit-hub",
      useSecureCookies: origin.startsWith("https://"),
    },
  });
}
