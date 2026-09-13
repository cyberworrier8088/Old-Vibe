import { getDb } from "./lib/db";
import { users } from "./lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { open } from "./lib/crypto";
import { getHackatimeProjects } from "./lib/hackatime/client";

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
  
  const res = await getHackatimeProjects(token);
  if (res && res.projects && res.projects.length > 0) {
    console.log("Keys in a project:", Object.keys(res.projects[0]));
    console.log("Sample project:");
    console.log(JSON.stringify(res.projects[0], null, 2));
  } else {
    console.log("No projects found.");
  }
}

main().catch(console.error);
