import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { items } from "../lib/db/schema";

async function main() {
  const db = getDb();
  const existing = await db.select().from(items).where(eq(items.name, "Gold Paper"));
  if (existing.length === 0) {
    await db.insert(items).values({
      name: "Gold Paper",
      description: "Exclusive reward for maintaining a 10-day coding streak.",
      cost: 50,
      hidden: true,
      position: 0,
    });
    console.log("Inserted Gold Paper");
  } else {
    console.log("Gold Paper already exists");
  }
}

main().catch(console.error);
