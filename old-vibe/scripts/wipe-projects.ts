import { getDb } from "../lib/db";
import { projects } from "../lib/db/schema";

async function main() {
  const db = getDb();
  await db.delete(projects);
  console.log("All projects have been wiped from the database.");
}

main().catch(console.error);
