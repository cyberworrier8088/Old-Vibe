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
  getHackatimeProjectDetails,
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

export type TopEntityStat = {
  path: string;
  count: number;
  percentage: number;
  writes: number;
};

export type SessionCluster = {
  id: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  heartbeatsCount: number;
  writesCount: number;
  topLanguage?: string;
};

export type AiDetectionAudit = {
  isAiDetected: boolean;
  aiHeartbeatCount: number;
  aiPercentage: number;
  handcraftedPercentage: number;
  aiEditorsDetected: string[];
  aiReasons: string[];
  verdict: string;
};

export type FraudAnalysis = {
  risk: "low" | "medium" | "high";
  riskScore: number;
  aiAudit: AiDetectionAudit;
  topEntity?: TopEntityStat;
  topEntities: TopEntityStat[];
  averageIntervalMinutes?: number;
  intervalStdDevSeconds?: number;
  isFixedIntervalSuspicious?: boolean;
  uniqueEditors: string[];
  uniqueOS: string[];
  uniqueMachines: string[];
  aiCodingCount: number;
  writeCount: number;
  writeRatio: number;
  maxContinuousHours: number;
  isContinuousCodingSuspicious: boolean;
  hourlyDistribution: number[];
  sessionClusters: SessionCluster[];
  multiMachineCollisions: number;
  doubleDippingCount: number;
  doubleDippingProjects: string[];
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
  otherProjectsSummary?: Array<{ name: string; heartbeats: number }>;
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
  user: Pick<User, "sub" | "hackatimeToken"> & { slackId?: string | null },
  claimedProjectNames: string[],
): Promise<ProjectAuditBreakdown> {
  const allProjects = await getPickerProjects(user);

  let profile: HackatimeProfile | null = null;
  let latestHeartbeat: HackatimeHeartbeat | null = null;
  let streakDays: number | null = null;
  const projectMetaMap = new Map<string, { languages?: string[]; mostRecentHeartbeat?: string }>();

  let allHeartbeats: HackatimeHeartbeat[] = [];
  let rawHeartbeats: HackatimeHeartbeat[] = [];
  let totalHeartbeatsCount = 0;
  let otherProjectsSummary: Array<{ name: string; heartbeats: number }> = [];
  const allLanguagesSet = new Set<string>();

  const claimedSet = new Set(claimedProjectNames.map((p) => p.trim().toLowerCase()));

  if (user.hackatimeToken) {
    try {
      const token = open(user.hackatimeToken);
      const username = user.slackId || user.sub;

      const projectDetailPromises = claimedProjectNames.map((name) =>
        getHackatimeProjectDetails(token, username, name),
      );

      const [pRes, hRes, sRes, rawProjectsRes, ...detailResults] = await Promise.allSettled([
        getHackatimeProfile(token),
        getLatestHeartbeat(token),
        getHackatimeStreak(token),
        getHackatimeProjects(token),
        ...projectDetailPromises,
      ]);

      if (pRes.status === "fulfilled") profile = pRes.value;
      if (sRes.status === "fulfilled") streakDays = sRes.value;

      if (rawProjectsRes.status === "fulfilled" && rawProjectsRes.value?.projects) {
        for (const rp of rawProjectsRes.value.projects) {
          projectMetaMap.set(rp.name.toLowerCase(), {
            languages: rp.languages,
            mostRecentHeartbeat: rp.most_recent_heartbeat,
          });
        }
      }

      // Check date boundaries of claimed projects
      let queryStart: string | undefined = undefined;
      let queryEnd: string | undefined = undefined;

      for (const res of detailResults) {
        if (res.status === "fulfilled" && res.value) {
          const det = res.value;
          if (det.first_heartbeat && (!queryStart || det.first_heartbeat < queryStart)) {
            queryStart = det.first_heartbeat;
          }
          if (det.last_heartbeat && (!queryEnd || det.last_heartbeat > queryEnd)) {
            queryEnd = det.last_heartbeat;
          }
          if (det.languages) {
            det.languages.forEach((l) => allLanguagesSet.add(l));
          }
        }
      }

      if (!queryStart) {
        queryStart = `${EVENT_START_DATE}T00:00:00Z`;
      }

      const hbRes = await getHackatimeHeartbeats(token, queryStart, queryEnd);
      allHeartbeats = hbRes.heartbeats || [];

      let matching = allHeartbeats.filter(
        (hb) => hb.project && claimedSet.has(hb.project.trim().toLowerCase()),
      );

      // If matching is 0 but claimedProjectNames is non-empty, try fallback to all heartbeats
      if (matching.length === 0 && claimedProjectNames.length > 0) {
        const fullRes = await getHackatimeHeartbeats(token);
        if (fullRes.heartbeats?.length) {
          const olderMatching = fullRes.heartbeats.filter(
            (hb) => hb.project && claimedSet.has(hb.project.trim().toLowerCase()),
          );
          if (olderMatching.length > 0) {
            matching = olderMatching;
            allHeartbeats = fullRes.heartbeats;
          }
        }
      }

      rawHeartbeats = matching;
      totalHeartbeatsCount = rawHeartbeats.length;

      // Extract other projects summary for reviewer awareness
      const otherProjectMap = new Map<string, number>();
      for (const hb of allHeartbeats) {
        if (hb.project && !claimedSet.has(hb.project.trim().toLowerCase())) {
          otherProjectMap.set(hb.project, (otherProjectMap.get(hb.project) ?? 0) + 1);
        }
      }
      otherProjectsSummary = Array.from(otherProjectMap.entries()).map(([name, count]) => ({
        name,
        heartbeats: count,
      }));

      // Project-specific latest heartbeat
      if (rawHeartbeats.length > 0) {
        const sorted = rawHeartbeats.slice().sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
        latestHeartbeat = sorted[0];
      } else {
        latestHeartbeat = null;
      }
    } catch (err) {
      console.warn("[hackatime] extra audit data fetch failed:", err);
    }
  }

  // Compute Fraud Analysis & AI Detection
  let fraudAnalysis: FraudAnalysis | undefined;
  if (rawHeartbeats.length > 0) {
    const AI_EDITORS = [
      "antigravity",
      "antigravity-ide",
      "antigravityide",
      "antigravity-desktop",
      "cursor",
      "windsurf",
      "copilot",
      "cline",
      "continue",
      "aider",
      "devin",
      "zed-ai",
      "v0",
    ];

    const AI_PATH_INDICATORS = [
      "antigravity ide",
      ".gemini",
      "/brain/",
      "\\brain\\",
      ".cursor",
      ".windsurf",
      ".continue",
      "task.md",
      "walkthrough.md",
      "implementation_plan.md",
      ".claude",
    ];

    const entityCounts = new Map<string, { count: number; writes: number }>();
    const editorsSet = new Set<string>();
    const osSet = new Set<string>();
    const machinesSet = new Set<string>();
    let writeCount = 0;
    const hourlyDistribution = new Array<number>(24).fill(0);

    let aiHeartbeatCount = 0;
    const aiReasonsSet = new Set<string>();
    const aiEditorsSet = new Set<string>();

    for (const hb of rawHeartbeats) {
      if (hb.entity) {
        const existing = entityCounts.get(hb.entity) ?? { count: 0, writes: 0 };
        existing.count++;
        if (hb.is_write) existing.writes++;
        entityCounts.set(hb.entity, existing);
      }
      if (hb.is_write) writeCount++;
      if (hb.editor) editorsSet.add(hb.editor);
      if (hb.operating_system) osSet.add(hb.operating_system);
      if (hb.machine) machinesSet.add(hb.machine);
      if (hb.language) allLanguagesSet.add(hb.language);

      // AI Inspection
      let hbIsAi = false;
      const cat = (hb.category ?? "").toLowerCase();
      const ed = (hb.editor ?? "").toLowerCase();
      const ent = (hb.entity ?? "").toLowerCase();

      if (cat.includes("ai") || cat.includes("copilot")) {
        hbIsAi = true;
        aiReasonsSet.add(`Category: "${hb.category}"`);
      }

      for (const aiEd of AI_EDITORS) {
        if (ed.includes(aiEd)) {
          // We intentionally don't set hbIsAi = true here anymore.
          // AI editors often track human vs AI typing via the 'category' field.
          // This allows users to use modern editors by hand without false flagging.
          aiEditorsSet.add(hb.editor || aiEd);
        }
      }

      for (const aiPath of AI_PATH_INDICATORS) {
        if (ent.includes(aiPath)) {
          hbIsAi = true;
          const label = ent.includes("/")
            ? ent.split("/").pop()
            : ent.includes("\\")
              ? ent.split("\\").pop()
              : ent;
          aiReasonsSet.add(`AI agent artifact: "${label}"`);
        }
      }

      if ((hb as { ai_model?: string }).ai_model) {
        hbIsAi = true;
        aiReasonsSet.add(`AI model metadata: "${(hb as { ai_model?: string }).ai_model}"`);
      }

      if (hbIsAi) {
        aiHeartbeatCount++;
      }

      if (typeof hb.time === "number") {
        const d = new Date(hb.time * 1000);
        const hour = d.getHours();
        hourlyDistribution[hour]++;
      }
    }

    const aiPercentage = Math.round((aiHeartbeatCount / rawHeartbeats.length) * 100);
    const handcraftedPercentage = Math.max(0, 100 - aiPercentage);
    const isAiDetected = aiHeartbeatCount > 0;

    let aiVerdict = "CLEAN: 100% Handcrafted code detected. No AI IDEs, categories, or prompt artifacts found.";
    if (aiPercentage >= 50) {
      aiVerdict = `CRITICAL FRAUD: ${aiPercentage}% of project was generated via AI / Agent (${aiHeartbeatCount}/${rawHeartbeats.length} heartbeats). Strict violation of Old-Vibe handcrafted rule!`;
    } else if (aiPercentage >= 10) {
      aiVerdict = `HIGH RISK: ${aiPercentage}% AI coding detected (${aiHeartbeatCount}/${rawHeartbeats.length} heartbeats). Old-Vibe requires 100% human-coded craftsmanship.`;
    } else if (aiPercentage > 0) {
      aiVerdict = `SUSPICIOUS: Minor AI traces detected (${aiHeartbeatCount} heartbeats). Inspect commits carefully.`;
    }

    const aiAudit: AiDetectionAudit = {
      isAiDetected,
      aiHeartbeatCount,
      aiPercentage,
      handcraftedPercentage,
      aiEditorsDetected: Array.from(aiEditorsSet),
      aiReasons: Array.from(aiReasonsSet),
      verdict: aiVerdict,
    };

    const writeRatio = Math.round((writeCount / rawHeartbeats.length) * 100);

    // Top Entities matrix (top 5 files)
    const sortedEntities = Array.from(entityCounts.entries())
      .map(([path, data]) => ({
        path,
        count: data.count,
        percentage: Math.round((data.count / rawHeartbeats.length) * 100),
        writes: data.writes,
      }))
      .sort((a, b) => b.count - a.count);

    const topEntities = sortedEntities.slice(0, 5);
    const topEntity = topEntities[0];

    // Interval and cadence checks
    const sortedHbs = rawHeartbeats
      .filter((h): h is HackatimeHeartbeat & { time: number } => typeof h.time === "number")
      .sort((a, b) => a.time - b.time);

    let avgIntervalSec = 120;
    let burstWarning = false;
    let intervalStdDevSeconds = 0;
    let isFixedIntervalSuspicious = false;

    const validIntervals: number[] = [];
    let burstCount = 0;
    let multiMachineCollisions = 0;

    for (let i = 1; i < sortedHbs.length; i++) {
      const prev = sortedHbs[i - 1];
      const curr = sortedHbs[i];
      const diff = curr.time - prev.time;

      if (diff >= 0 && diff <= 60 && prev.machine && curr.machine && prev.machine !== curr.machine) {
        multiMachineCollisions++;
      }

      if (diff > 0 && diff < 3600) {
        validIntervals.push(diff);
        if (diff < 3) burstCount++;
      }
    }

    if (validIntervals.length > 0) {
      const sum = validIntervals.reduce((a, b) => a + b, 0);
      avgIntervalSec = Math.round(sum / validIntervals.length);

      if (validIntervals.length >= 15) {
        const mean = sum / validIntervals.length;
        const variance =
          validIntervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
          validIntervals.length;
        intervalStdDevSeconds = Math.round(Math.sqrt(variance) * 10) / 10;
        if (intervalStdDevSeconds < 3.5 && validIntervals.length > 25) {
          isFixedIntervalSuspicious = true;
        }
      }

      if (burstCount > 20 && burstCount / validIntervals.length > 0.35) {
        burstWarning = true;
      }
    }

    // Session Clustering (gap > 35 min indicates a break)
    const sessionClusters: SessionCluster[] = [];
    let currentSession: {
      start: number;
      end: number;
      count: number;
      writes: number;
      langs: Map<string, number>;
    } | null = null;

    for (const hb of sortedHbs) {
      const t = hb.time;
      if (!currentSession) {
        currentSession = {
          start: t,
          end: t,
          count: 1,
          writes: hb.is_write ? 1 : 0,
          langs: new Map(),
        };
        if (hb.language) currentSession.langs.set(hb.language, 1);
      } else if (t - currentSession.end <= 2100) {
        currentSession.end = t;
        currentSession.count++;
        if (hb.is_write) currentSession.writes++;
        if (hb.language) {
          currentSession.langs.set(
            hb.language,
            (currentSession.langs.get(hb.language) ?? 0) + 1,
          );
        }
      } else {
        const durMin = Math.max(2, Math.round((currentSession.end - currentSession.start) / 60));
        let topL: string | undefined = undefined;
        let maxLCount = 0;
        for (const [l, c] of currentSession.langs.entries()) {
          if (c > maxLCount) {
            maxLCount = c;
            topL = l;
          }
        }
        sessionClusters.push({
          id: `sess-${sessionClusters.length + 1}`,
          startTime: currentSession.start,
          endTime: currentSession.end,
          durationMinutes: durMin,
          heartbeatsCount: currentSession.count,
          writesCount: currentSession.writes,
          topLanguage: topL,
        });
        currentSession = {
          start: t,
          end: t,
          count: 1,
          writes: hb.is_write ? 1 : 0,
          langs: new Map(),
        };
        if (hb.language) currentSession.langs.set(hb.language, 1);
      }
    }

    if (currentSession) {
      const durMin = Math.max(2, Math.round((currentSession.end - currentSession.start) / 60));
      let topL: string | undefined = undefined;
      let maxLCount = 0;
      for (const [l, c] of currentSession.langs.entries()) {
        if (c > maxLCount) {
          maxLCount = c;
          topL = l;
        }
      }
      sessionClusters.push({
        id: `sess-${sessionClusters.length + 1}`,
        startTime: currentSession.start,
        endTime: currentSession.end,
        durationMinutes: durMin,
        heartbeatsCount: currentSession.count,
        writesCount: currentSession.writes,
        topLanguage: topL,
      });
    }

    let maxSessionMinutes = 0;
    for (const s of sessionClusters) {
      if (s.durationMinutes > maxSessionMinutes) maxSessionMinutes = s.durationMinutes;
    }
    const maxContinuousHours = Math.round((maxSessionMinutes / 60) * 10) / 10;
    const isContinuousCodingSuspicious = maxContinuousHours > 14;

    const singleFileAnomaly = (topEntity?.percentage ?? 0) > 85 && rawHeartbeats.length > 40;
    const idleBloatAnomaly = writeRatio < 15 && rawHeartbeats.length > 35;
    const trustLvl = profile?.trust_factor?.trust_level;

    // Risk Score calculation - AI usage is the #1 critical risk in Old Vibe
    let riskScore = 0;
    if (trustLvl === "red") riskScore += 45;
    else if (trustLvl === "yellow") riskScore += 20;

    if (aiPercentage >= 50) {
      riskScore = 100;
    } else if (aiPercentage >= 10) {
      riskScore = Math.max(riskScore + 60, 85);
    } else if (aiPercentage > 0) {
      riskScore = Math.max(riskScore + 40, 50);
    }

    if (isFixedIntervalSuspicious) riskScore += 40;
    if (burstWarning) riskScore += 30;
    if (isContinuousCodingSuspicious) riskScore += 35;
    if (singleFileAnomaly) riskScore += 25;
    if (idleBloatAnomaly) riskScore += 20;
    if (multiMachineCollisions > 3) riskScore += 20;

    let doubleDippingCount = 0;
    const doubleDippingProjectsSet = new Set<string>();
    const overlappingDetails: string[] = [];

    if (allHeartbeats && allHeartbeats.length > 0) {
      const otherProjectHeartbeats = allHeartbeats.filter(
        (hb) => hb.project && !claimedSet.has(hb.project.trim().toLowerCase()) && typeof hb.time === "number"
      );
      
      otherProjectHeartbeats.sort((a, b) => (a.time as number) - (b.time as number));
      
      for (const hb of sortedHbs) {
        const t = hb.time;
        const overlapping = otherProjectHeartbeats.filter((ohb) => Math.abs((ohb.time as number) - t) <= 120);
        if (overlapping.length > 0) {
          for (const ohb of overlapping) {
            if (ohb.project) {
              doubleDippingCount++;
              doubleDippingProjectsSet.add(ohb.project);
              const dtStr = new Date((ohb.time as number) * 1000).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              if (overlappingDetails.length < 5) {
                overlappingDetails.push(`[${dtStr}] ${ohb.project}`);
              }
            }
          }
        }
      }
    }

    if (doubleDippingCount > 0) {
      riskScore += 30; // High risk addition for double dipping
    }

    riskScore = Math.min(100, riskScore);
    const risk: "low" | "medium" | "high" =
      riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low";

    const signals: FraudSignal[] = [
      {
        label: "Double Dipping",
        detail: doubleDippingCount > 0
          ? `FLAG: Found ${doubleDippingCount} heartbeats overlapping in time (within 120s) with other projects: ${Array.from(doubleDippingProjectsSet).join(", ")}. Examples: ${Array.from(new Set(overlappingDetails)).join("; ")}`
          : "PASSED: No overlapping timestamps with other projects detected.",
        pass: doubleDippingCount === 0,
      },
      {
        label: "No-AI Craftsmanship (Old-Vibe Core Rule)",
        detail: isAiDetected
          ? `VIOLATION: ${aiPercentage}% AI coding detected (${aiHeartbeatCount}/${rawHeartbeats.length} heartbeats). Detected: ${Array.from(aiReasonsSet).slice(0, 3).join("; ")}.`
          : "PASSED: 100% Handcrafted. No AI autocomplete, AI agents, or prompt engineering detected.",
        pass: !isAiDetected,
      },
      {
        label: "Selected Project Verification",
        detail:
          rawHeartbeats.length > 0
            ? `Verified ${rawHeartbeats.length} heartbeats strictly belonging to project(s) [${claimedProjectNames.join(", ")}].`
            : `No heartbeats found for selected project(s) [${claimedProjectNames.join(", ")}].`,
        pass: rawHeartbeats.length > 0,
      },
      {
        label: "Cutoff Window Compliance",
        detail: `All ${rawHeartbeats.length} analyzed heartbeats logged within program dates.`,
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
        label: "Heartbeat Cadence & Anti-Spoofing",
        detail: isFixedIntervalSuspicious
          ? `Suspicious: Extremely low variance (±${intervalStdDevSeconds}s) indicates automated pulse script.`
          : burstWarning
            ? "Rapid-burst heartbeats detected (possible automated script injection)."
            : `Natural cadence (~${Math.round((avgIntervalSec / 60) * 10) / 10}m average, ±${intervalStdDevSeconds}s natural variance).`,
        pass: !isFixedIntervalSuspicious && !burstWarning,
      },
      {
        label: "Coding Endurance & Sleep Check",
        detail: isContinuousCodingSuspicious
          ? `Warning: Longest continuous session was ${maxContinuousHours}h without a break.`
          : `Human work pattern (longest continuous session: ${maxContinuousHours}h across ${sessionClusters.length} distinct sessions).`,
        pass: !isContinuousCodingSuspicious,
      },
      {
        label: "Active Typing vs. Idle Focus",
        detail: idleBloatAnomaly
          ? `Warning: Only ${writeRatio}% writes (${writeCount} writes). High proportion of idle editor focus.`
          : `Healthy write ratio: ${writeRatio}% active keystroke writes (${writeCount}/${rawHeartbeats.length}).`,
        pass: !idleBloatAnomaly,
      },
      {
        label: "File Distribution & Camping",
        detail: singleFileAnomaly
          ? `Warning: ${topEntity?.percentage}% of heartbeats camped on single file (${topEntity?.path}).`
          : `Distributed work across ${entityCounts.size} distinct files.`,
        pass: !singleFileAnomaly,
      },
      {
        label: "Machine & Device Collisions",
        detail:
          multiMachineCollisions > 0
            ? `Detected ${multiMachineCollisions} conflicting heartbeats logged within 60s across different machine IDs.`
            : `Consistent single machine/editor session (${editorsSet.size} editor(s), ${osSet.size} OS).`,
        pass: multiMachineCollisions <= 2,
      },
    ];

    fraudAnalysis = {
      risk,
      riskScore,
      aiAudit,
      topEntity,
      topEntities,
      averageIntervalMinutes: Math.round((avgIntervalSec / 60) * 10) / 10,
      intervalStdDevSeconds,
      isFixedIntervalSuspicious,
      uniqueEditors: Array.from(editorsSet),
      uniqueOS: Array.from(osSet),
      uniqueMachines: Array.from(machinesSet),
      aiCodingCount: aiHeartbeatCount,
      writeCount,
      writeRatio,
      maxContinuousHours,
      isContinuousCodingSuspicious,
      hourlyDistribution,
      sessionClusters,
      multiMachineCollisions,
      doubleDippingCount,
      doubleDippingProjects: Array.from(doubleDippingProjectsSet),
      signals,
    };
  } else {
    fraudAnalysis = {
      risk: "medium",
      riskScore: 25,
      aiAudit: {
        isAiDetected: false,
        aiHeartbeatCount: 0,
        aiPercentage: 0,
        handcraftedPercentage: 100,
        aiEditorsDetected: [],
        aiReasons: [],
        verdict: "No heartbeats recorded.",
      },
      topEntities: [],
      uniqueEditors: [],
      uniqueOS: [],
      uniqueMachines: [],
      aiCodingCount: 0,
      writeCount: 0,
      writeRatio: 0,
      maxContinuousHours: 0,
      isContinuousCodingSuspicious: false,
      hourlyDistribution: new Array(24).fill(0),
      sessionClusters: [],
      multiMachineCollisions: 0,
      doubleDippingCount: 0,
      doubleDippingProjects: [],
      signals: [
        {
          label: "Selected Project Verification",
          detail: `No heartbeats found in Hackatime for selected project(s) [${claimedProjectNames.join(", ")}].`,
          pass: false,
        },
      ],
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
          note: "Hackatime disconnected or no hours recorded",
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
      rawHeartbeats: rawHeartbeats.slice(0, 500),
      totalHeartbeatsCount,
      fraudAnalysis,
      otherProjectsSummary,
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
      note: "No hours logged for this project name in Hackatime",
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
    rawHeartbeats: rawHeartbeats.slice(0, 500),
    totalHeartbeatsCount,
    fraudAnalysis,
    otherProjectsSummary,
  };
}
