/**
 * Local development only.
 *
 * Signing in normally goes through Hack Club Auth, which needs OAuth credentials. This script
 * creates (or reuses) a test user in your LOCAL database and prints a signed session cookie, so
 * you can click around the app without those credentials.
 *
 *   npm run dev:login               # a maker
 *   npm run dev:login -- --reviewer # a reviewer (first ORGANIZER_SLACK_IDS entry, else U0DEVREVIEW)
 *
 * Then paste the printed snippet into your browser console on http://localhost:3000.
 */
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "@/lib/auth/session-token";
import { organizerSlackIds } from "@/lib/auth/organizer";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assertLocal() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-login refuses to run with NODE_ENV=production.");
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");

  const { hostname } = new URL(raw);
  if (!LOOPBACK.has(hostname)) {
    throw new Error(
      `dev-login only works against a local database, but DATABASE_URL points at "${hostname}".`,
    );
  }
}

async function main() {
  assertLocal();

  const reviewer = process.argv.includes("--reviewer");
  const slackId = reviewer ? (organizerSlackIds()[0] ?? "U0DEVREVIEW") : "U0DEVMAKER";
  const row = {
    sub: reviewer ? "dev|reviewer" : "dev|maker",
    email: reviewer ? "dev-reviewer@example.com" : "dev-maker@example.com",
    name: reviewer ? "Dev Reviewer" : "Dev Maker",
    slackId,
  };

  await getDb()
    .insert(users)
    .values(row)
    .onConflictDoUpdate({
      target: users.sub,
      set: { email: row.email, name: row.name, slackId: row.slackId },
    });

  const token = await createSessionToken(row.sub);

  console.log(`Signed in as ${row.name} (${row.slackId}). Paste this into the browser console:\n`);
  console.log(
    `document.cookie = "${SESSION_COOKIE}=${token}; path=/; max-age=${SESSION_MAX_AGE}"; location.href = "/dash";\n`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
