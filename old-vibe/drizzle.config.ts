import { defineConfig } from "drizzle-kit";

import { connectionUrl } from "./lib/db/url";

// Migrations change the schema, so they use the admin role when one is configured.
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set MIGRATION_DATABASE_URL or DATABASE_URL before running drizzle-kit.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: connectionUrl(url) },
  strict: true,
  verbose: true,
});
