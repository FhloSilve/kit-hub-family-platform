# Kit Hub: Family Platform

Your family's digital home: a warm, private household platform for shared plans, tasks, groceries, notes, communication, and the future interactive house.

## Current milestone

Kit Hub is in private-beta stabilization. The active platform includes:

- Today, Calendar, Tasks, Groceries, Meals, Notes, Routines, and Household views
- Household chat, direct messages, reactions, announcements, notifications, and attachments
- Household-scoped APIs with centralized membership, permission, and rate-limit guards
- Better Auth email/password accounts, authenticator-app two-factor authentication, and session controls
- Secure household invitations, ownership handoff, and protected account deletion
- Silvi household assistance with explicit confirmation before any data-changing action
- Privacy-first presence, account export, security telemetry, and platform-admin readiness tools
- Protected GitHub Actions production releases with D1 migrations and post-deployment verification
- Unit, security-regression, and Cloudflare Worker-runtime integration tests

The generated interactive house remains a future product milestone. Current work should favor security, reliability, accessibility, and beta feedback over expanding the feature surface.

## Stack

- React + Vite
- Cloudflare Workers + Cloudflare Vite plugin
- Cloudflare D1
- Better Auth
- Hono
- TypeScript + Vitest

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Replace BETTER_AUTH_SECRET with output from: openssl rand -base64 32
npm run types
npm run db:migrate:local
npm run dev
```

For a frontend-only design preview that does not require D1:

```bash
npm run dev:ui
```

## Quality checks

```bash
npm run typecheck
npm test
npm run build
# Or run the complete suite:
npm run ci
```

## Cloudflare connection checklist

`wrangler.jsonc` binds production to the existing `kit-hub-db` database. Keep that database ID unchanged unless the application is intentionally moved to another D1 database.

Apply pending migrations to the local D1 database before development:

```bash
npm run db:migrate:local
```

Remote migrations and deployment are intentionally owned by the protected production workflow below.

## Production deployments

GitHub Actions is the sole production deployment path. Pull requests and pushes to `main` run the non-deploying `ci.yml` workflow. A platform administrator can then start the protected `production-release.yml` workflow from Kit Hub.

Configure the GitHub `production` environment with required reviewers and these secrets:

- `CLOUDFLARE_API_TOKEN`, scoped to deploy this Worker and apply migrations to its D1 database
- `CLOUDFLARE_ACCOUNT_ID`

The production workflow runs checks, applies pending D1 migrations, deploys the Worker, verifies `/api/health` and `/api/ready`, records the verified commit in D1, and confirms the release marker. Keep automatic production deployment from Cloudflare Workers Builds disabled so schema-dependent code cannot deploy before its migration.

The Worker name in Cloudflare and `wrangler.jsonc` must both stay `kit-hub-family-platform`. Do not commit `.dev.vars`, production secrets, GitHub tokens, or Cloudflare credentials.

## Repository map

```text
src/             React application and design system
worker/          Worker API and Better Auth integration
shared/          Contracts and validation shared by UI/API
migrations/      Versioned D1 schema
scripts/         Release verification utilities
wrangler.jsonc   Cloudflare bindings and deployment config
```

## Architectural rules already enforced

- The household is the tenant boundary.
- Authorization is enforced by the Worker, never trusted to the client.
- Owner/admin roles do not imply access to another adult's private content.
- Secrets stay outside source control.
- The everyday UI and future digital house will use the same APIs and data.
- IDs use Web Crypto UUIDs; security-sensitive IDs never use `Math.random()`.
