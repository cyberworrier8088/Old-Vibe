import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { assertSafeForProduction, connectionUrl, wantsTls } from "./url";

type Database = ReturnType<typeof create>;

declare global {
  var __oldVibeDb: Database | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertSafeForProduction(url);

  const client = postgres(connectionUrl(url), {
    max: 10,
    ssl: wantsTls(url) ? "require" : undefined,
    connect_timeout: 10,
    idle_timeout: 30,
    // A runaway query should fail, not hold a connection and the page behind it.
    connection: { statement_timeout: 30_000, idle_in_transaction_session_timeout: 30_000 },
  });
  return drizzle(client, { schema });
}

export function getDb(): Database {
  return (globalThis.__oldVibeDb ??= create());
}
