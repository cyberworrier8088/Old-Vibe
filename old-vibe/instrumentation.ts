export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { getDb } = await import("@/lib/db");
  try {
    await migrate(getDb(), { migrationsFolder: "./drizzle" });
  } catch (error) {
    console.warn("[migrate] notice during schema migration:", error);
  }

  const { getReviewBackend, reviewConfigProblems } = await import("@/lib/review");
  console.info(`[review] backend is ${getReviewBackend().name}`);
  for (const problem of reviewConfigProblems()) console.error(`[review] ${problem}`);
}
