import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { moderationActions, users } from "@/lib/db/schema";
import type { ModerationAction, User } from "@/lib/db/schema";
import { banMessage, banStatus, sanctionFor } from "@/lib/ladder";
import type { Sanction } from "@/lib/ladder";

/** Violations that still count: bans that were not voided as a mistake. */
export async function countViolations(userSub: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.userSub, userSub),
        eq(moderationActions.voided, false),
        sql`${moderationActions.kind} in ('temp_ban', 'permanent_ban')`,
      ),
    );
  return row?.n ?? 0;
}

export async function latestBanReason(userSub: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ reason: moderationActions.reason })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.userSub, userSub),
        eq(moderationActions.voided, false),
        sql`${moderationActions.kind} in ('temp_ban', 'permanent_ban')`,
      ),
    )
    .orderBy(desc(moderationActions.createdAt))
    .limit(1);
  return row?.reason ?? null;
}

export async function historyFor(userSub: string): Promise<ModerationAction[]> {
  return getDb()
    .select()
    .from(moderationActions)
    .where(eq(moderationActions.userSub, userSub))
    .orderBy(desc(moderationActions.createdAt));
}

export async function recordViolation(input: {
  userSub: string;
  issuedBy: string;
  reason: string;
  projectId?: string | null;
  fraud: boolean;
}): Promise<Sanction> {
  return getDb().transaction(async (tx) => {
    // Lock the maker so two reviewers acting at once cannot both read the same count.
    await tx.select({ sub: users.sub }).from(users).where(eq(users.sub, input.userSub)).for("update");

    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.userSub, input.userSub),
          eq(moderationActions.voided, false),
          sql`${moderationActions.kind} in ('temp_ban', 'permanent_ban')`,
        ),
      );

    const sanction = sanctionFor(row?.n ?? 0, input.fraud);
    const until = sanction.kind === "temp_ban" ? sanction.until : null;

    await tx.insert(moderationActions).values({
      userSub: input.userSub,
      issuedBy: input.issuedBy,
      kind: sanction.kind,
      reason: input.reason,
      projectId: input.projectId ?? null,
      expiresAt: until,
    });

    await tx
      .update(users)
      .set(
        sanction.kind === "permanent_ban"
          ? { bannedPermanently: true, bannedUntil: null }
          : { bannedUntil: sanction.until },
      )
      .where(eq(users.sub, input.userSub));

    return sanction;
  });
}

/** Lift a ban. `mistake` also removes it from the count so it cannot push the next one up. */
export async function liftBan(input: {
  userSub: string;
  issuedBy: string;
  reason: string;
  mistake: boolean;
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.select({ sub: users.sub }).from(users).where(eq(users.sub, input.userSub)).for("update");

    if (input.mistake) {
      const [latest] = await tx
        .select({ id: moderationActions.id })
        .from(moderationActions)
        .where(
          and(
            eq(moderationActions.userSub, input.userSub),
            eq(moderationActions.voided, false),
            sql`${moderationActions.kind} in ('temp_ban', 'permanent_ban')`,
          ),
        )
        .orderBy(desc(moderationActions.createdAt))
        .limit(1);
      if (latest) {
        await tx.update(moderationActions).set({ voided: true }).where(eq(moderationActions.id, latest.id));
      }
    }

    await tx.insert(moderationActions).values({
      userSub: input.userSub,
      issuedBy: input.issuedBy,
      kind: "lifted",
      reason: input.reason,
    });

    await tx
      .update(users)
      .set({ bannedUntil: null, bannedPermanently: false })
      .where(eq(users.sub, input.userSub));
  });
}

/** For route handlers: a 403 response when the maker is currently banned, otherwise null. */
export async function banBlock(
  user: Pick<User, "sub" | "bannedUntil" | "bannedPermanently">,
): Promise<NextResponse | null> {
  const status = banStatus(user);
  if (!status.banned) return null;
  const reason = await latestBanReason(user.sub);
  return NextResponse.json({ error: "banned", message: banMessage(status, reason) }, { status: 403 });
}
