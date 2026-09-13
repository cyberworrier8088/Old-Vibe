import { and, eq, sql } from "drizzle-orm";

import { BEANS_PER_HOUR } from "@/lib/rewards";
import { getDb } from "@/lib/db";
import { beansLedger } from "@/lib/db/schema";
import type { Project } from "@/lib/db/schema";

export function beansForMinutes(minutes: number | null | undefined, streak: number = 0): number {
  if (!minutes || minutes <= 0) return 0;
  const rate = BEANS_PER_HOUR + (streak * 0.1);
  return Math.round((minutes / 60) * rate);
}

export function hoursLabel(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0";
  return (minutes / 60).toFixed(1).replace(/\.0$/, "");
}

export async function balanceFor(userSub: string): Promise<{ paper: number; gold: number }> {
  const rows = await getDb()
    .select({
      currency: beansLedger.currency,
      total: sql<number>`coalesce(sum(${beansLedger.delta}), 0)::int`,
    })
    .from(beansLedger)
    .where(eq(beansLedger.userSub, userSub))
    .groupBy(beansLedger.currency);

  const balance = { paper: 0, gold: 0 };
  for (const row of rows) {
    if (row.currency === "paper" || row.currency === "gold") {
      balance[row.currency] = row.total;
    }
  }
  return balance;
}

export async function netForProject(projectId: string, currency: "paper" | "gold" = "paper"): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${beansLedger.delta}), 0)::int` })
    .from(beansLedger)
    .where(and(eq(beansLedger.projectId, projectId), eq(beansLedger.currency, currency)));
  return row?.total ?? 0;
}

export async function reconcileProjectBeans(
  project: Pick<Project, "id" | "userSub" | "decision" | "approvedMinutes">,
  userStreak: number = 0
): Promise<{ delta: number }> {
  const target = project.decision === "approved" ? beansForMinutes(project.approvedMinutes, userStreak) : 0;
  const net = await netForProject(project.id);
  const delta = target - net;

  if (delta === 0) return { delta: 0 };

  await getDb()
    .insert(beansLedger)
    .values({
      userSub: project.userSub,
      delta,
      reason: delta > 0 ? "approval" : "revert",
      currency: "paper",
      projectId: project.id,
    });

  return { delta };
}
