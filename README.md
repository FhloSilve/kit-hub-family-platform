# Kit Hub: Family Platform

Your family's digital home: a warm, private household platform for shared plans, tasks, groceries, notes, communication, and the future interactive house.

## Current milestone

Milestone 2 builds the Everyday Core on the Milestone 1 foundation:

- Functional Today, Calendar, Tasks, Groceries, and Household views
- Quick Add forms for tasks, grocery items, and calendar events
- Task completion/reopen and grocery checked/unchecked interactions
- Live household member directory from memberships
- Cloudflare Worker API with household-scoped `/api/v1` Everyday Core routes
- Better Auth email/password accounts and cookie sessions
- D1 migration for identity, profiles, households, memberships, roles, permissions, invites, and audit records
- Household onboarding with language and time-zone defaults
- Development-only demo dashboard at `/?demo=1`
- Mobile bottom navigation and accessible reduced-motion behavior
- Server-enforced password strength with a readable account-creation meter
- In-app update detection and one-click refresh when a new Worker version is live
- TypeScript validation, unit tests, structured API errors, and request IDs

Chat, Notes, realtime, household invitations/role editing, meal planning, and the generated house remain intentionally deferred. Calendar, Tasks, Groceries, and the household member directory are active in Milestone 2.

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

Confirm the production secret exists, apply pending migrations, and deploy:

```bash
npx wrangler secret list
npm run db:migrate:remote
npm run deploy
```

For a release that applies pending D1 migrations before building and deploying:

```bash
npm run release
```

## Automatic deployments

Cloudflare Workers Builds can deploy every pushed production change automatically. Connect the existing Worker once in **Cloudflare → Workers & Pages → kit-hub-family-platform → Settings → Builds → Connect** and select:

- Repository: `FhloSilve/kit-hub-family-platform`
- Production branch: `main`
- Build command: `npm run ci`
- Deploy command: `npm run deploy:ci`

The Worker name in Cloudflare and `wrangler.jsonc` must both stay `kit-hub-family-platform`. Cloudflare stores the build token; do not add an API token to this repository.

After this connection is active, pushing to `main` runs the checks and deploys the new Worker version. Kit Hub checks its version while open and shows **Update now** when that deployment is ready, so users do not need to close the browser.

D1 migrations remain a deliberate release step through `npm run release`; Cloudflare's default Workers Builds token intentionally does not have D1-edit permission. This prevents database changes from running silently on every code push.

Do not commit `.dev.vars`, production secrets, or Cloudflare credentials.

## Repository map

```text
src/             React application and design system
worker/          Worker API and Better Auth integration
shared/          Contracts and validation shared by UI/API
migrations/      Versioned D1 schema
wrangler.jsonc   Cloudflare bindings and deployment config
```

## Architectural rules already enforced

- The household is the tenant boundary.
- Authorization is enforced by the Worker, never trusted to the client.
- Owner/admin roles do not imply access to another adult's private content.
- Secrets stay outside source control.
- The everyday UI and future digital house will use the same APIs and data.
- IDs use Web Crypto UUIDs; security-sensitive IDs never use `Math.random()`.
