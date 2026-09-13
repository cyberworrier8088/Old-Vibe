import { getDb } from "../lib/db";
import { beansLedger, projectJournals, projects, yswsSubmissions } from "../lib/db/schema";

async function main() {
  const db = getDb();

  console.log("Deleting yswsSubmissions...");
  await db.delete(yswsSubmissions);

  console.log("Deleting projectJournals...");
  await db.delete(projectJournals);

  console.log("Deleting beansLedger...");
  await db.delete(beansLedger);

  console.log("Deleting all projects...");
  await db.delete(projects);

  console.log("All projects and related records have been deleted successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to wipe projects:", err);
  process.exit(1);
});
