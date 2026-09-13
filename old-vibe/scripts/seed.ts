import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";

const MAKER = {
  sub: "ident!seed0001",
  email: "imu@hackclub.com",
  name: "imu",
  slackId: "U0SEED001",
};

async function seed() {
  const db = getDb();

  await db.insert(users).values(MAKER).onConflictDoNothing();

  await db
    .insert(projects)
    .values([
      {
        userSub: MAKER.sub,
        title: "no vibe code",
        description: "A handcrafted project built without AI autocomplete or prompt engineering.",
        repoUrl: "https://github.com/imu/no-vibe-code",
        demoUrl: "https://example.com/no-vibe-code",
        thumbnailUrl: "https://example.com/thumb-no-vibe-code.png",
        hackatimeProjects: ["no-vibe-code"],
        submittedAt: new Date(),
        decision: "approved",
        approvedMinutes: 720,
        noteToMaker: "Lovely handcrafted work, approved.",
        decidedAt: new Date(),
      },
      {
        userSub: MAKER.sub,
        title: "tide, a tiny tidal clock",
        description: "A tiny desk clock that shows the local tide.",
        repoUrl: "https://github.com/imu/tide",
        demoUrl: "https://example.com/tide",
        thumbnailUrl: "https://example.com/thumb-tide.png",
        hackatimeProjects: ["tide", "tide-firmware"],
        submittedAt: new Date(),
      },
      {
        userSub: MAKER.sub,
        title: "2am radio",
        hackatimeProjects: [],
      },
    ])
    .onConflictDoNothing();

  console.log("seeded 1 maker (imu) and 3 projects (including no vibe code)");
  process.exit(0);
}

seed();
