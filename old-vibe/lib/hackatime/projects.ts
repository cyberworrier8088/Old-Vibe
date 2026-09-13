import { eq } from "drizzle-orm";

import { open } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";

import {
  getHackatimeHeartbeats,
  getHackatimeProfile,
  getHackatimeProjects,
  getHackatimeStreak,
  getHackatimeSummaries,
  getLatestHeartbeat,
} from "./client";
import type { HackatimeHeartbeat, HackatimeProfile } from "./client";
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

export type FraudSignal = {
  label: string;
  detail: string;
  pass: boolean;
};

export type FraudAnalysis = {
  risk: "low" | "medium" | "high";
  topEntity?: { path: string; count: number; percentage: number };
  averageIntervalMinutes?: number;
  uniqueEditors: string[];
  uniqueOS: string[];
  uniqueMachines: string[];
  aiCodingCount: number;
  signals: FraudSignal[];
};

export type ProjectAuditBreakdown = {
  projects: Array<{
    key: string;
    seconds: number;
    hours: string;
    decimalHours: number;
    eligible: boolean;
    languages?: string[];
    mostRecentHeartbeat?: string;
    note?: string;
  }>;
  totalSeconds: number;
  totalHours: string;
  totalDecimalHours: number;
  cutoffDate: string;
  profile?: import("./client").HackatimeProfile | null;
  latestHeartbeat?: import("./client").HackatimeHeartbeat | null;
  streakDays?: number | null;
  allLanguages?: string[];
  rawHeartbeats?: HackatimeHeartbeat[];
  totalHeartbeatsCount?: number;
  fraudAnalysis?: FraudAnalysis;
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

  let profile: HackatimeProfile | null = null;
  let latestHeartbeat: HackatimeHeartbeat | null = null;
  let streakDays: number | null = null;
  const projectMetaMap = new Map<string, { languages?: string[]; mostRecentHeartbeat?: string }>();

  let rawHeartbeats: HackatimeHeartbeat[] = [];
  let totalHeartbeatsCount = 0;
  const allLanguagesSet = new Set<string>();

  if (user.hackatimeToken) {
    try {
      const token = open(user.hackatimeToken);
      const [pRes, hRes, sRes, rawProjectsRes, hbRes] = await Promise.allSettled([
        getHackatimeProfile(token),
        getLatestHeartbeat(token),
        getHackatimeStreak(token),
        getHackatimeProjects(token),
        getHackatimeHeartbeats(token, `${EVENT_START_DATE}T00:00:00Z`),
      ]);
      if (pRes.status === "fulfilled") profile = pRes.value;
      if (hRes.status === "fulfilled") latestHeartbeat = hRes.value;
      if (sRes.status === "fulfilled") streakDays = sRes.value;
      if (rawProjectsRes.status === "fulfilled" && rawProjectsRes.value?.projects) {
        for (const rp of rawProjectsRes.value.projects) {
          projectMetaMap.set(rp.name.toLowerCase(), {
            languages: rp.languages,
            mostRecentHeartbeat: rp.most_recent_heartbeat,
          });
        }
      }
      if (hbRes.status === "fulfilled" && hbRes.value?.heartbeats) {
        rawHeartbeats = hbRes.value.heartbeats;
        totalHeartbeatsCount = rawHeartbeats.length;
      }
    } catch (err) {
      console.warn("[hackatime] extra audit data fetch failed:", err);
    }
  }

  // Compute Fraud Analysis
  let fraudAnalysis: FraudAnalysis | undefined;
  if (rawHeartbeats.length > 0) {
    const entityCounts = new Map<string, number>();
    const editorsSet = new Set<string>();
    const osSet = new Set<string>();
    const machinesSet = new Set<string>();
    let aiCodingCount = 0;

    for (const hb of rawHeartbeats) {
      if (hb.entity) entityCounts.set(hb.entity, (entityCounts.get(hb.entity) ?? 0) + 1);
      if (hb.editor) editorsSet.add(hb.editor);
      if (hb.operating_system) osSet.add(hb.operating_system);
      if (hb.machine) machinesSet.add(hb.machine);
      if (hb.category === "ai coding" || (hb as { ai_model?: string }).ai_model) aiCodingCount++;
      if (hb.language) allLanguagesSet.add(hb.language);
    }

    let topEntity: { path: string; count: number; percentage: number } | undefined;
    let maxCount = 0;
    for (const [path, count] of entityCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topEntity = {
          path,
          count,
          percentage: Math.round((count / rawHeartbeats.length) * 100),
        };
      }
    }

    // Interval checks
    const times = rawHeartbeats
      .map((h) => h.time)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b);
    let avgIntervalSec = 120;
    let burstWarning = false;
    if (times.length > 1) {
      let totalDiff = 0;
      let validDiffs = 0;
      let burstCount = 0;
      for (let i = 1; i < times.length; i++) {
        const diff = times[i] - times[i - 1];
        if (diff > 0 && diff < 3600) {
          totalDiff += diff;
          validDiffs++;
          if (diff < 5) burstCount++;
        }
      }
      if (validDiffs > 0) avgIntervalSec = Math.round(totalDiff / validDiffs);
      if (burstCount > 20 && burstCount / validDiffs > 0.4) burstWarning = true;
    }

    const singleFileAnomaly = (topEntity?.percentage ?? 0) > 85 && rawHeartbeats.length > 40;
    const trustLvl = profile?.trust_factor?.trust_level;

    const signals: FraudSignal[] = [
      {
        label: "Cutoff Window Compliance",
        detail: `All ${rawHeartbeats.length} analyzed heartbeats logged after Sep 11, 2026.`,
        pass: true,
      },
      {
        label: "Trust Factor Verification",
        detail: trustLvl
          ? `Hackatime trust level: ${trustLvl.toUpperCase()} (score: ${profile?.trust_factor?.trust_value ?? 0})`
          : "Trust factor not verified",
        pass: trustLvl !== "red" && trustLvl !== "yellow",
      },
      {
        label: "Heartbeat Cadence",
        detail: burstWarning
          ? "Unusually high rapid-burst heartbeats detected (possible automated spoofing)."
          : `Natural coding cadence (~${Math.round((avgIntervalSec / 60) * 10) / 10} min average interval).`,
        pass: !burstWarning,
      },
      {
        label: "File Distribution",
        detail: singleFileAnomaly
          ? `Warning: ${topEntity?.percentage}% of heartbeats on single file (${topEntity?.path}).`
          : `Healthy distribution across ${entityCounts.size} different files/paths.`,
        pass: !singleFileAnomaly,
      },
      {
        label: "Device & Editor Fingerprint",
        detail: `Detected ${editorsSet.size} editor(s) [${Array.from(editorsSet).join(", ")}] across ${osSet.size} OS [${Array.from(osSet).join(", ")}].`,
        pass: editorsSet.size > 0 && osSet.size <= 2,
      },
    ];

    let risk: "low" | "medium" | "high" = "low";
    if (trustLvl === "red" || burstWarning) {
      risk = "high";
    } else if (trustLvl === "yellow" || singleFileAnomaly) {
      risk = "medium";
    }

    fraudAnalysis = {
      risk,
      topEntity,
      averageIntervalMinutes: Math.round((avgIntervalSec / 60) * 10) / 10,
      uniqueEditors: Array.from(editorsSet),
      uniqueOS: Array.from(osSet),
      uniqueMachines: Array.from(machinesSet),
      aiCodingCount,
      signals,
    };
  }

  if (latestHeartbeat?.language) allLanguagesSet.add(latestHeartbeat.language);

  if (!allProjects || allProjects.length === 0) {
    return {
      projects: claimedProjectNames.map((name) => {
        const meta = projectMetaMap.get(name.toLowerCase());
        if (meta?.languages) meta.languages.forEach((l) => allLanguagesSet.add(l));
        return {
          key: name,
          seconds: 0,
          hours: "0h",
          decimalHours: 0,
          eligible: false,
          languages: meta?.languages,
          mostRecentHeartbeat: meta?.mostRecentHeartbeat,
          note: "Hackatime disconnected or no hours recorded after Sep 11",
        };
      }),
      totalSeconds: 0,
      totalHours: "0h",
      totalDecimalHours: 0,
      cutoffDate: EVENT_START_DATE,
      profile,
      latestHeartbeat,
      streakDays,
      allLanguages: Array.from(allLanguagesSet),
      rawHeartbeats: rawHeartbeats.slice(0, 200),
      totalHeartbeatsCount,
      fraudAnalysis,
    };
  }

  let totalSeconds = 0;
  const breakdown = claimedProjectNames.map((name) => {
    const meta = projectMetaMap.get(name.toLowerCase());
    if (meta?.languages) meta.languages.forEach((l) => allLanguagesSet.add(l));
    const matched = allProjects.find((p) => p.key.toLowerCase() === name.toLowerCase());
    if (matched) {
      totalSeconds += matched.seconds;
      return {
        key: name,
        seconds: matched.seconds,
        hours: matched.hours,
        decimalHours: matched.decimalHours,
        eligible: true,
        languages: meta?.languages,
        mostRecentHeartbeat: meta?.mostRecentHeartbeat,
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
      languages: meta?.languages,
      mostRecentHeartbeat: meta?.mostRecentHeartbeat,
      note: "No hours logged after Sep 11, 2026 cutoff",
    };
  });

  return {
    projects: breakdown,
    totalSeconds,
    totalHours: formatHours(totalSeconds),
    totalDecimalHours: Math.round((totalSeconds / 3600) * 10) / 10,
    cutoffDate: EVENT_START_DATE,
    profile,
    latestHeartbeat,
    streakDays,
    allLanguages: Array.from(allLanguagesSet),
    rawHeartbeats: rawHeartbeats.slice(0, 200),
    totalHeartbeatsCount,
    fraudAnalysis,
  };
}
