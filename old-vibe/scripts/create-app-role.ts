/**
 * Creates (or refreshes) the restricted database role the app runs as.
 *
 * The app only ever reads and writes rows, so it gets exactly that: no superuser, no schema
 * changes, no new roles. Schema changes go through MIGRATION_DATABASE_URL, which is the admin role.
 *
 *   APP_DB_PASSWORD=<random 24+ chars> npm run db:app-role
 *
 * Safe to run again: it resets the password and re-applies the grants, including for tables that
 * migrations have added since.
 */
import postgres from "postgres";

import { connectionUrl } from "../lib/db/url";

const adminUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const role = process.env.APP_DB_USER ?? "oldvibe_app";
const password = process.env.APP_DB_PASSWORD ?? "";

if (!adminUrl) throw new Error("Set MIGRATION_DATABASE_URL (the admin connection).");
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("APP_DB_USER is not a plain role name.");
// Restricted to URL-safe characters so it can be quoted into the statement below.
if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) {
  throw new Error("Set APP_DB_PASSWORD to 24 or more letters, digits, - or _.");
}

async function main() {
  const sql = postgres(connectionUrl(adminUrl as string), { max: 1 });
  const quoted = `"${role}"`;

  try {
    const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
    const database = `"${db.replace(/"/g, '""')}"`;

    const exists = await sql`select 1 from pg_roles where rolname = ${role}`;
    if (exists.length === 0) {
      await sql.unsafe(
        `create role ${quoted} login nosuperuser nocreatedb nocreaterole noreplication password '${password}'`,
      );
    } else {
      await sql.unsafe(
        `alter role ${quoted} login nosuperuser nocreatedb nocreaterole noreplication password '${password}'`,
      );
    }

    await sql.unsafe(`revoke all on database ${database} from public`);
    await sql.unsafe(`grant connect on database ${database} to ${quoted}`);
    await sql.unsafe(`grant usage on schema public to ${quoted}`);
    await sql.unsafe(`grant select, insert, update, delete on all tables in schema public to ${quoted}`);
    await sql.unsafe(`grant usage, select on all sequences in schema public to ${quoted}`);
    await sql.unsafe(
      `alter default privileges in schema public grant select, insert, update, delete on tables to ${quoted}`,
    );
    await sql.unsafe(
      `alter default privileges in schema public grant usage, select on sequences to ${quoted}`,
    );

    console.log(`Role ${role} is ready on ${db}: data access only.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
