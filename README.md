# Kit Hub: Family Organizer

Kit Hub is a private, shared home base for household calendars, tasks, groceries,
notes, conversations, and everyday coordination.

This repository contains the first full-stack foundation:

- a responsive React interface for desktop and mobile;
- email/password authentication through Better Auth;
- a Cloudflare Worker API built with Hono;
- a Cloudflare D1 schema for users, households, roles, tasks, groceries, events,
  notes, channels, and messages;
- working household onboarding, tasks, and grocery interactions;
- privacy-ready visibility fields and owner/admin/member/child roles.

## Stack

- React 19 + Vite
- Cloudflare Workers Static Assets
- Hono
- Cloudflare D1
- Better Auth + Drizzle adapter
- TypeScript

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Replace BETTER_AUTH_SECRET with: openssl rand -base64 48
npm run db:migrate:local
npm run dev
```

Open the local URL printed by Wrangler. The Worker serves the production Vite
build and handles all `/api/*` routes.

For front-end-only styling work, run `npm run dev:client` while the Worker is
available on port `8787`.

## Validation

```bash
npm run check
```

This regenerates Cloudflare binding types, runs strict TypeScript checks, builds
the client, and performs a Worker deployment dry run.

## Database migrations

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Migrations are stored in `migrations/`. Apply them locally before development
and remotely before deploying code that depends on a new schema.

## Production configuration

The Worker expects:

- a D1 binding named `DB` connected to `kit-hub-db`;
- a secret named `BETTER_AUTH_SECRET` containing at least 32 high-entropy
  characters.

Set the production secret without committing it:

```bash
openssl rand -base64 48 | npx wrangler secret put BETTER_AUTH_SECRET
```

Then apply migrations and deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

## Current milestone

The dashboard and shared data foundation are ready. Calendar, notes, messages,
invitations, room mapping, translation, and detailed permissions are represented
in the architecture and will be expanded module by module.
