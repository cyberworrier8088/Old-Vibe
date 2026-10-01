import { eq } from "drizzle-orm";

import { open } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";

import { getHackatimeStreak } from "./client";

const TTL_MS = 10 * 60_000;
const lastChecked = new Map<string, number>();

/** Stores a streak read from Hackatime. Returns the value now on record. */
export async function saveStreak(sub: string, days: number, current: number): Promise<number> {
  const value = Math.max(0, Math.floor(days));
  if (value === current) return current;

  await getDb()
    .update(users)
    .set({ streak: value, lastCodingDate: value > 0 ? new Date().toISOString().slice(0, 10) : null })
    .where(eq(users.sub, sub));
  return value;
}

/**
 * The streak sets the Paper rate, so it comes from Hackatime rather than a number set once and
 * left to go stale. Checked at most every ten minutes per maker; any failure keeps what we had.
 */
export async function syncStreak(
  user: Pick<User, "sub" | "hackatimeToken" | "streak">,
): Promise<number> {
  if (!user.hackatimeToken) return user.streak;

  const last = lastChecked.get(user.sub);
  if (last && Date.now() - last < TTL_MS) return user.streak;
  lastChecked.set(user.sub, Date.now());

  try {
    const days = await getHackatimeStreak(open(user.hackatimeToken));
    return typeof days === "number" ? await saveStreak(user.sub, days, user.streak) : user.streak;
  } catch (error) {
    console.warn("[hackatime] streak sync failed:", error);
    return user.streak;
  }
}
