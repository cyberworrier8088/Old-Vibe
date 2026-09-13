import { getDb } from "../lib/db";
import { beansLedger, orders, projectJournals, projects, users } from "../lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();

  // 1. Reset Paper / Beans (Clear ledger entries)
  const deletedBeans = await db.delete(beansLedger);
  console.log("Cleared beans_ledger (paper & gold reset to 0).");

  // 2. Clear any orders
  await db.delete(orders);
  console.log("Cleared orders table.");

  // 3. Clear project journals
  await db.delete(projectJournals);
  console.log("Cleared project journals.");

  // 4. Reset all projects: tracked_seconds = 0, approved_minutes = null, decision = null, etc.
  await db.update(projects).set({
    trackedSeconds: 0,
    approvedMinutes: null,
    decision: null,
    decidedAt: null,
    noteToMaker: null,
  });
  console.log("Reset all project times (tracked_seconds = 0, approved_minutes = null, decisions = null).");

  // 5. Reset user streaks
  await db.update(users).set({
    streak: 0,
    lastCodingDate: null,
  });
  console.log("Reset user streaks to 0.");

  console.log("\nDatabase reset complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error during reset:", err);
  process.exit(1);
});
