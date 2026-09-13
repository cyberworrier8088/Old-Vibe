import { eq } from "drizzle-orm";

import { open } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";

import { getHackatimeProjects, getHackatimeSummaries } from "./client";
import { formatHours } from "./format";

export { formatHours };

export const EVENT_START_DATE = "2026-09-11";
export const EVENT_START_DATE_OBJ = new Date("2026-09-11T00:00:00Z");

export type PickerProject = {
  key: string;
  hours: string;
  seconds: number;
  decimalHours: number;
  cutoffApplied?: boolean;
};

export type ProjectAuditBreakdown = {
  projects: Array<{
    key: string;
    seconds: number;
    hours: string;
    decimalHours: number;
    eligible: boolean;
    note?: string;
  }>;
  totalSeconds: number;
  totalHours: string;
  totalDecimalHours: number;
  cutoffDate: string;
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; projects: PickerProject[] }>();

async function forget(sub: string) {
  cache.delete(sub);
  await getDb().update(users).set({ hackatimeToken: null }).where(eq(users.sub, sub));
}

export async function getPickerProjects(
  user: Pick<User, "sub" | "hackatimeToken">,
): Promise<PickerProject[] | null> {
  if (!user.hackatimeToken) return null;

  const hit = cache.get(user.sub);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.projects;

  let token: string;
  try {
    token = open(user.hackatimeToken);
  } catch (error) {
    console.error("[hackatime] stored token could not be opened", error);
    await forget(user.sub);
    return null;
  }

  try {
    // 1. First attempt to fetch summaries from the cutoff date (2026-09-11)
    // This strictly includes ONLY hours worked from September 11, 2026 onwards.
    try {
      const summaries = await getHackatimeSummaries(token, EVENT_START_DATE);
      if (summaries?.data && summaries.data.length > 0) {
        const projectTotals = new Map<string, number>();

        for (const day of summaries.data) {
          if (!day.projects) continue;
          for (const p of day.projects) {
            if (!p.name || p.total_seconds <= 0) continue;
            projectTotals.set(p.name, (projectTotals.get(p.name) ?? 0) + p.total_seconds);
          }
        }

        if (projectTotals.size > 0) {
          const mapped: PickerProject[] = Array.from(projectTotals.entries())
            .filter(([_, seconds]) => seconds > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([name, seconds]) => ({
              key: name,
              seconds,
              hours: formatHours(seconds),
              decimalHours: Math.round((seconds / 3600) * 10) / 10,
              cutoffApplied: true,
            }));

          cache.set(user.sub, { at: Date.now(), projects: mapped });
          return mapped;
        }
      }
    } catch (summaryError) {
      console.warn("[hackatime] summaries query fallback to projects list:", summaryError);
    }

    // 2. Fallback: query projects list
    const { projects } = await getHackatimeProjects(token);
    const mapped: PickerProject[] = projects
      .filter((project) => {
        if (!project.name || project.total_seconds <= 0) return false;
        // If project was created before the cutoff date, cut off / exclude:
        if (project.created_at && new Date(project.created_at) < EVENT_START_DATE_OBJ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.total_seconds - a.total_seconds)
      .map((project) => ({
        key: project.name,
        seconds: project.total_seconds,
        hours: formatHours(project.total_seconds),
        decimalHours: Math.round((project.total_seconds / 3600) * 10) / 10,
        cutoffApplied: false,
      }));

    cache.set(user.sub, { at: Date.now(), projects: mapped });
    return mapped;
  } catch (error) {
    console.error("[hackatime] projects fetch failed", error);
    if (error instanceof Error && error.message.includes("401")) await forget(user.sub);
    return null;
  }
}

export async function getMakerProjectBreakdown(
  user: Pick<User, "sub" | "hackatimeToken">,
  claimedProjectNames: string[],
): Promise<ProjectAuditBreakdown> {
  const allProjects = await getPickerProjects(user);

  if (!allProjects || allProjects.length === 0) {
    return {
      projects: claimedProjectNames.map((name) => ({
        key: name,
        seconds: 0,
        hours: "0h",
        decimalHours: 0,
        eligible: false,
        note: "Hackatime disconnected or no hours recorded after Sep 11",
      })),
      totalSeconds: 0,
      totalHours: "0h",
      totalDecimalHours: 0,
      cutoffDate: EVENT_START_DATE,
    };
  }

  let totalSeconds = 0;
  const breakdown = claimedProjectNames.map((name) => {
    const matched = allProjects.find((p) => p.key.toLowerCase() === name.toLowerCase());
    if (matched) {
      totalSeconds += matched.seconds;
      return {
        key: name,
        seconds: matched.seconds,
        hours: matched.hours,
        decimalHours: matched.decimalHours,
        eligible: true,
        note: matched.cutoffApplied
          ? "Filtered to work logged after Sep 11, 2026"
          : "Tracked in Hackatime",
      };
    }
    return {
      key: name,
      seconds: 0,
      hours: "0h",
      decimalHours: 0,
      eligible: false,
      note: "No hours logged after Sep 11, 2026 cutoff",
    };
  });

  return {
    projects: breakdown,
    totalSeconds,
    totalHours: formatHours(totalSeconds),
    totalDecimalHours: Math.round((totalSeconds / 3600) * 10) / 10,
    cutoffDate: EVENT_START_DATE,
  };
}
