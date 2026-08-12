import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { assessPassword } from "../shared/password";

export interface AuthOrigins {
  authOrigin: string;
  trustedOrigins: string[];
}

export function resolveAuthOrigins(request: Request, configuredAuthURL: string): AuthOrigins {
  const requestURL = new URL(request.url);
  const requestOrigin = requestURL.origin;
  const isLocalRequest = requestURL.hostname === "localhost" || requestURL.hostname === "127.0.0.1";
  const authOrigin = isLocalRequest ? requestOrigin : new URL(configuredAuthURL).origin;

  return {
    authOrigin,
    trustedOrigins: [authOrigin],
  };
}

export function createAuth(env: Env, request: Request) {
  const { authOrigin, trustedOrigins } = resolveAuthOrigins(request, env.BETTER_AUTH_URL);

  return betterAuth({
    appName: "Kit Hub",
    baseURL: authOrigin,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    plugins: [
      twoFactor({
        issuer: "Kit Hub",
      }),
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/sign-up/email") return;

        const password = context.body?.password;
        if (typeof password !== "string" || !assessPassword(password).acceptable) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Choose at least 10 characters with two of these: uppercase letters, numbers or symbols — or use a 16-character passphrase.",
          });
        }
      }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      deferSessionRefresh: true,
    },
    advanced: {
      cookiePrefix: "kit-hub",
      useSecureCookies: authOrigin.startsWith("https://"),
    },
  });
}
