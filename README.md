# Kit Hub: Family Platform

Your family's digital home: a warm, private household platform for shared plans, tasks, groceries, notes, communication, and the future interactive house.

## Current milestone

Milestone 1 establishes the vertical foundation:

- React 19 application and responsive Today shell
- Cloudflare Worker API with versioned `/api/v1` routes
- Better Auth email/password accounts and cookie sessions
- D1 migration for identity, profiles, households, memberships, roles, permissions, invites, and audit records
- Household onboarding with language and time-zone defaults
- Development-only demo dashboard at `/?demo=1`
- Mobile bottom navigation and accessible reduced-motion behavior
- TypeScript validation, unit tests, structured API errors, and request IDs

Calendar, Tasks, Groceries, Notes, realtime, invitations, and the generated house are intentionally represented by safe empty/coming-soon states until their implementation milestones.

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
```

## Cloudflare connection checklist

`wrangler.jsonc` deliberately contains a zero-value D1 `database_id`. Replace it with the ID of the existing `kit-hub-db` database before any remote migration or deployment. This prevents an accidental production write or creation of a second database.

Then configure the production secret and deploy:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npm run db:migrate:remote
npm run deploy
```

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
