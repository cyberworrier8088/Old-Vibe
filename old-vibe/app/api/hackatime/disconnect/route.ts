import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { forget } from "@/lib/hackatime/projects";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Reviewers audit a submission through the maker's Hackatime. Letting the link be cut while a
  // project is waiting would let someone avoid the audit, so it waits until the review is done.
  const [waiting] = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.userSub, user.sub), isNotNull(projects.submittedAt), isNull(projects.decision)),
    )
    .limit(1);

  if (waiting) {
    return NextResponse.json(
      {
        error: "in_review",
        message: "A project of yours is waiting for review. You can disconnect once it has a decision.",
      },
      { status: 409 },
    );
  }

  await forget(user.sub);
  await getDb().update(users).set({ hackatimeId: null }).where(eq(users.sub, user.sub));

  return NextResponse.json({ ok: true });
}
