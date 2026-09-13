import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  try {
    await db.execute(sql`ALTER TABLE "users" RENAME COLUMN "strikes" TO "streak";`);
    console.log("Renamed strikes to streak.");
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("does not exist")) {
      console.log("Column strikes does not exist (might be already renamed).");
    } else {
      console.error(err);
    }
  }

  try {
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_coding_date" date;`);
    console.log("Added last_coding_date.");
  } catch (err: unknown) {
    console.error(err);
  }
}

main().catch(console.error);
