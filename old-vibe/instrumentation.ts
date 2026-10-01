export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await migrateSchema();

  const { getReviewBackend, reviewConfigProblems } = await import("@/lib/review");
  console.info(`[review] backend is ${getReviewBackend().name}`);
  for (const problem of reviewConfigProblems()) console.error(`[review] ${problem}`);
}

/**
 * Schema changes need more rights than the app should have at runtime. When MIGRATION_DATABASE_URL
 * is set, migrations run on their own short-lived connection with that admin role, and the app
 * itself keeps using the restricted DATABASE_URL.
 */
async function migrateSchema() {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const adminUrl = process.env.MIGRATION_DATABASE_URL;

  try {
    if (!adminUrl) {
      const { getDb } = await import("@/lib/db");
      await migrate(getDb(), { migrationsFolder: "./drizzle" });
      return;
    }

    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const { connectionUrl, wantsTls } = await import("@/lib/db/url");

    const client = postgres(connectionUrl(adminUrl), {
      max: 1,
      ssl: wantsTls(adminUrl) ? "require" : undefined,
    });
    try {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.warn("[migrate] notice during schema migration:", error);
  }
}
