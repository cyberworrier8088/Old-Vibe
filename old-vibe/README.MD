# Old Vibe

A Hack Club "You Ship, We Ship" program. Makers write software by hand, track their time with
Hackatime, submit it, and earn Paper to spend in the Old Vibe shop.

Maintained by @hridhaan-s (github)

## How it works

1. A maker signs in with Hack Club Auth and connects Hackatime.
2. They pick the Hackatime projects they worked on and submit a repo, a playable demo and a screenshot.
3. A reviewer opens the submission in the review workstation, checks the audit (heartbeats, AI traces,
   double dipping, README) and records a decision with approved hours.
4. Approved hours become Paper in the ledger. Paper buys items in the shop; orders are fulfilled by hand.

## Stack

Next.js (App Router), React, TypeScript, Postgres with Drizzle, CSS Modules. No UI framework.

## Running it locally

```bash
cp .env.example .env     # then fill in the values below
docker compose up -d db  # or point DATABASE_URL at any Postgres
npm install
npm run db:migrate
npm run dev              # http://localhost:3000
```

No OAuth credentials yet? `npm run dev:login` creates a test user in your local database and prints a
cookie to paste into the browser console. Add `-- --reviewer` for reviewer access.

### Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public origin, used for OAuth redirects |
| `SESSION_SECRET` | 32+ random characters, signs session cookies |
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored Hackatime tokens |
| `HCA_CLIENT_ID`, `HCA_CLIENT_SECRET`, `HCA_ISSUER` | Hack Club Auth app |
| `HACKATIME_CLIENT_ID`, `HACKATIME_CLIENT_SECRET`, `HACKATIME_BASE_URL` | Hackatime OAuth app |
| `ORGANIZER_SLACK_IDS` | Comma-separated Slack member IDs allowed to review. Empty means nobody; `*` means everyone |
| `SUPERVIEWER_WEBHOOK_SECRET` | Shared secret for decisions pushed from an external review backend |

Never commit `.env`. Rotate any secret that has been pasted into a chat or a ticket.

Redirect URIs to register: `<APP_URL>/api/auth/callback` (Hack Club Auth) and
`<APP_URL>/api/hackatime/callback` (Hackatime).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | Checks that must pass before merging |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |
| `npm run db:seed-shop` | Seed the shop catalogue |
| `npm run dev:login` | Local test sign-in (refuses non-local databases) |

## Project layout

- `app/(site)` public pages, `app/(app)` signed-in app (`dash`, `shop`), `app/api` route handlers
- `lib/hackatime` Hackatime client and the fraud/authenticity analysis
- `lib/review` pluggable review backend (local, or an external Superviewer)
- `lib/rewards.ts` the Paper rate; keep it in step with shop prices
- `proxy.ts` gates `/dash` and `/shop` behind a session

## Conventions

- CSS Modules do not fail the build on a missing class, an undefined `var(--x)` or an unbalanced brace.
  Check these when you touch a stylesheet.
- Colours come from `app/tokens.css`. `--night` is the cream page, `--cream` is the ink.
- Reviewer-only data never goes to the browser: pass client components only the fields they render.
