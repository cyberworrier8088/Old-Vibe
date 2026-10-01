import { open } from "@/lib/crypto";
import type { User } from "@/lib/db/schema";

import { getHackatimeProfile } from "./client";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; github: string | null; slackId: string | null }>();

/** Who the stored Hackatime token belongs to, for showing "connected as ...". */
export async function getConnectedIdentity(
  user: Pick<User, "sub" | "hackatimeToken">,
): Promise<{ github: string | null; slackId: string | null } | null> {
  if (!user.hackatimeToken) return null;

  const hit = cache.get(user.sub);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  try {
    const profile = await getHackatimeProfile(open(user.hackatimeToken));
    const identity = {
      at: Date.now(),
      github: profile.github_username ?? null,
      slackId: profile.slack_id ?? null,
    };
    cache.set(user.sub, identity);
    return identity;
  } catch (error) {
    console.warn("[hackatime] profile fetch failed:", error);
    return null;
  }
}
