import { getDb } from "./lib/db";
import { users } from "./lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { open } from "./lib/crypto";
import { getHackatimeHeartbeats } from "./lib/hackatime/client";

async function main() {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: isNotNull(users.hackatimeToken)
  });

  if (!user || !user.hackatimeToken) {
    console.log("No user with hackatime token found.");
    return;
  }

  const token = open(user.hackatimeToken);
  console.log("Fetched token for user", user.slackId);

  const res = await getHackatimeHeartbeats(token);
  if (res && res.heartbeats && res.heartbeats.length > 0) {
    console.log("Keys in a heartbeat:", Object.keys(res.heartbeats[0]));
    console.log("Sample heartbeat:");
    console.log(JSON.stringify(res.heartbeats[0], null, 2));
    
    // Check if any heartbeat has 'labels', 'claims', etc
    const hasLabels = res.heartbeats.find(h => 'labels' in h || 'claims' in h || 'ysws' in h || 'tags' in h || 'properties' in h || 'ysws_claims' in h);
    if (hasLabels) {
      console.log("Found a heartbeat with labels/claims!");
      console.log(JSON.stringify(hasLabels, null, 2));
    }
  } else {
    console.log("No heartbeats found.");
  }
}

main().catch(console.error);
