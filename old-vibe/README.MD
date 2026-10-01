# Old Vibe, the app

Notes for working on the code. The overview of the program is in the [root README](../README.md).

Next.js (App Router), TypeScript, Postgres through Drizzle, plain CSS Modules.

## Setup

```bash
cp .env.example .env
docker compose up -d db     # or use any Postgres and set DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

If you have no OAuth credentials yet, `npm run dev:login` creates a test user in your local
database and prints a cookie to paste into the browser console. Add `-- --reviewer` to get the
reviewer pages. It refuses to run against a database that is not on localhost.

## Environment

The ones people trip over:

- The database uses two roles. `DATABASE_URL` is a restricted role (`oldvibe_app`) that can only read
  and write rows: no schema changes, no superuser, no creating roles. `MIGRATION_DATABASE_URL` is the
  admin role and is only used for migrations. Create the restricted role once with
  `APP_DB_PASSWORD=<random> npm run db:app-role`. In production the app refuses to start with a weak
  or default database password, and requires TLS unless the database is on the same machine or network.
- `SESSION_SECRET` needs to be 32 or more random characters.
- `TOKEN_ENCRYPTION_KEY` encrypts the Hackatime tokens we store.
- `ORGANIZER_SLACK_IDS` is a comma separated list of Slack member IDs allowed to review. Empty
  means nobody can, and `*` means everyone can, so be careful with it.
- `CDN_TOKEN` is a Hack Club CDN API key (cdn.hackclub.com/api_keys). Project screenshots upload there.
  Without it makers can still paste an image link.
- `HCA_*` are the Hack Club Auth credentials, `HACKATIME_*` are the Hackatime OAuth app.
- The redirect URIs to register are `APP_URL/api/auth/callback` and
  `APP_URL/api/hackatime/callback`.
- `SUPERVIEWER_*` are only needed if reviews go to an external Superviewer instead of the built
  in review desk.

Do not commit `.env`. If a secret ever lands in a chat or an issue, rotate it.

## Where things are

- `app/(site)` the public pages, `app/(app)` the signed in app, `app/api` the routes
- `lib/hackatime` the Hackatime client and the review audit (AI traces, double dipping, pasted
  code, cadence)
- `lib/review` the review backend, local or external
- `lib/rewards.ts` the Paper rate and what a Paper costs us. Change it together with shop prices
- `proxy.ts` sends signed out visitors away from `/dash` and `/shop`

## Things that have bitten us

CSS Modules do not complain about a class that does not exist, a `var(--x)` that is not defined,
or a missing closing brace. A missing brace once switched off the whole mobile layout of the
review page without a single error. If you edit a stylesheet, look at the page.

The theme is light. In `app/tokens.css`, `--night` is the cream page and `--cream` is the ink, which
reads backwards, so check before you reuse a colour.

Client components only get the fields they draw. Do not pass a whole database row from a server
component.
