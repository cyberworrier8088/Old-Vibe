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
  getHackatimeProjectsFiltered,
  getHackatimeProjectDetails,
} from "./client";
import type { HackatimeHeartbeat, HackatimeProfile } from "./client";
import { AI_PATH_INDICATORS, attributeAi, isAiHeartbeat } from "./ai";
import { totalsFrom } from "./duration";
import { formatHours } from "./format";
import { findIdleRuns } from "./idle";

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

/** Old-Vibe allows a small slip: up to this share of changed lines may be AI-written. */
export const AI_TOLERANCE_PERCENT = 1;

export type AiDetectionAudit = {
  isAiDetected: boolean;
  /** What aiPercentage is a share of: changed lines when Hackatime reports them, else heartbeats. */
  basis: "lines" | "heartbeats";
  aiHeartbeatCount: number;
  aiPercentage: number;
  handcraftedPercentage: number;
  aiLines: number;
  humanLines: number;
  aiSessions: number;
  aiOutputTokens: number;
  aiEditorsDetected: string[];
  aiReasons: string[];
  verdict: string;
};

export type FraudAnalysis = {
  risk: "low" | "medium" | "high";
  riskScore: number;
  authenticityScore: number;
  recommendedDecision: "APPROVE" | "SCRUTINIZE" | "REJECT";
  decisionReasons: string[];
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
  activeHoursCount: number;
  isZombieCodingSuspicious: boolean;
  suspiciousLineJumpsCount: number;
  /** Large additions to one file within seconds: how pasted code looks in a heartbeat stream. */
  pasteBurstCount: number;
  /** Minutes of write heartbeats with a frozen cursor: what an auto key presser leaves behind. */
  idleMinutes: number;
  longestIdleMinutes: number;
  changedLines: number;
  /** Null when the editor does not report changed lines, so nothing can be said. */
  linesPerHour: number | null;
  maxLineJump: number;
  noiseEntitiesCount: number;
  noiseEntityRatio: number;
  sessionClusters: SessionCluster[];
  multiMachineCollisions: number;
  doubleDippingCount: number;
  doubleDippingMinutes: number;
  doubleDippingProjects: string[];
  doubleDippingDetails: string[];
  cleanEstimatedHours: number;
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

/** Drops the cached project list and the stored token, for a disconnect or a token that stopped working. */
export async function forget(sub: string) {
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
    // Hackatime applies the start date itself, so a project that began before the event still
    // shows the hours worked since it, and nothing earlier.
    const { projects } = await getHackatimeProjectsFiltered(token, { startDate: EVENT_START_DATE });
    const mapped: PickerProject[] = projects
      .filter((project) => project.name && project.total_seconds > 0)
      .sort((a, b) => b.total_seconds - a.total_seconds)
      .map((project) => ({
        key: project.name,
        seconds: project.total_seconds,
        hours: formatHours(project.total_seconds),
        decimalHours: Math.round((project.total_seconds / 3600) * 10) / 10,
        cutoffApplied: true,
      }));

    cache.set(user.sub, { at: Date.now(), projects: mapped });
    return mapped;
  } catch (error) {
    console.error("[hackatime] projects fetch failed", error);
    if (error instanceof Error && error.message.includes("401")) await forget(user.sub);
    return null;
  }
}

const BREAKDOWN_TTL_MS = 60_000;
const BREAKDOWN_CACHE_MAX = 50;
const breakdowns = new Map<string, { at: number; result: Promise<ProjectAuditBreakdown> }>();

/**
 * Reviewers reload a ship repeatedly while deciding, and each audit costs several round trips to
 * Hackatime, so a finished one is reused for a minute. Callers that arrive while one is being built
 * share it. An audit that found no heartbeats is not kept: that is usually Hackatime failing
 * rather than a maker with none, and the next load should try again.
 */
export function getMakerProjectBreakdown(
  user: Pick<User, "sub" | "hackatimeToken"> & { slackId?: string | null },
  claimedProjectNames: string[],
): Promise<ProjectAuditBreakdown> {
  const key = [user.sub, ...claimedProjectNames.map((name) => name.trim().toLowerCase()).sort()].join(
    "\0",
  );
  const hit = breakdowns.get(key);
  if (hit && Date.now() - hit.at < BREAKDOWN_TTL_MS) return hit.result;

  const entry = { at: Date.now(), result: buildMakerProjectBreakdown(user, claimedProjectNames) };
  breakdowns.delete(key);
  if (breakdowns.size >= BREAKDOWN_CACHE_MAX) {
    const oldest = breakdowns.keys().next().value;
    if (oldest !== undefined) breakdowns.delete(oldest);
  }
  breakdowns.set(key, entry);

  entry.result.then(
    (audit) => {
      entry.at = Date.now();
      if (!audit.totalHeartbeatsCount && breakdowns.get(key) === entry) breakdowns.delete(key);
    },
    () => {
      if (breakdowns.get(key) === entry) breakdowns.delete(key);
    },
  );

  return entry.result;
}

async function buildMakerProjectBreakdown(
  user: Pick<User, "sub" | "hackatimeToken"> & { slackId?: string | null },
  claimedProjectNames: string[],
): Promise<ProjectAuditBreakdown> {
  // Started now but awaited later: it does not depend on the audit calls below, so they overlap
  // instead of queueing behind it. The empty catch only stops an early failure being reported as
  // unhandled; it still throws where it is awaited.
  const allProjectsRequest = getPickerProjects(user);
  allProjectsRequest.catch(() => {});

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

      const [pRes, sRes, rawProjectsRes, ...detailResults] = await Promise.allSettled([
        getHackatimeProfile(token),
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

  const allProjects = await allProjectsRequest;

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

    const NOISE_PATH_PATTERNS = [
      "node_modules",
      "/vendor/",
      "\\vendor\\",
      "/.git/",
      "\\.git\\",
      "/target/",
      "\\target\\",
      "/dist/",
      "\\dist\\",
      "/build/",
      "\\build\\",
      "appdata/local/temp",
      "/tmp/",
      "\\tmp\\",
      "package-lock.json",
      "cargo.lock",
      "yarn.lock",
      "pnpm-lock.yaml",
    ];

    const entityCounts = new Map<string, { count: number; writes: number }>();
    const editorsSet = new Set<string>();
    const osSet = new Set<string>();
    const machinesSet = new Set<string>();
    let writeCount = 0;
    let noiseEntitiesCount = 0;
    let maxLineJump = 0;
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

        const entLower = hb.entity.toLowerCase();
        if (NOISE_PATH_PATTERNS.some((pat) => entLower.includes(pat))) {
          noiseEntitiesCount++;
        }
      }

      if (typeof hb.lines === "number" && hb.lines > maxLineJump) {
        maxLineJump = hb.lines;
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

      if (cat.includes("ai") || cat.includes("copilot") || cat.includes("chat") || cat.includes("completion")) {
        hbIsAi = true;
        aiReasonsSet.add(`Category: "${hb.category}"`);
      }

      for (const aiEd of AI_EDITORS) {
        if (ed.includes(aiEd)) {
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

      if (hb.ai_model) {
        hbIsAi = true;
        aiReasonsSet.add(`AI model metadata: "${hb.ai_model}"`);
      }

      if (!hbIsAi && isAiHeartbeat(hb)) hbIsAi = true;

      if (hbIsAi) {
        aiHeartbeatCount++;
      }

      if (typeof hb.time === "number") {
        const d = new Date(hb.time * 1000);
        const hour = d.getHours();
        hourlyDistribution[hour]++;
      }
    }

    // Hackatime's own line counts (AI-written against human-written) are the measure when they
    // exist. Without them the share of AI-marked heartbeats is the best available estimate.
    const attribution = attributeAi(rawHeartbeats);
    const heartbeatShare = Math.round((aiHeartbeatCount / rawHeartbeats.length) * 100);
    const basis: AiDetectionAudit["basis"] = attribution.aiLineShare !== null ? "lines" : "heartbeats";
    const aiPercentage = attribution.aiLineShare ?? heartbeatShare;
    const handcraftedPercentage = Math.max(0, Math.round((100 - aiPercentage) * 10) / 10);
    // An AI-enabled editor is allowed. What counts is how much of the code the AI wrote, and a
    // small slip is tolerated.
    const isAiDetected = basis === "lines" ? aiPercentage > AI_TOLERANCE_PERCENT : aiHeartbeatCount > 0;
    const unit = basis === "lines" ? "of changed lines" : "of heartbeats";

    const evidence: string[] = [];
    if (attribution.hasLineData) {
      evidence.push(
        `Hackatime counts ${attribution.aiLines.toLocaleString()} AI-written lines against ${attribution.humanLines.toLocaleString()} written by hand.`,
      );
    }
    if (attribution.sessions > 0) {
      evidence.push(
        `${attribution.sessions} AI session(s), ${attribution.outputTokens.toLocaleString()} output tokens generated.`,
      );
    }
    for (const model of attribution.models.slice(0, 3)) evidence.push(`AI model: ${model.name}`);

    let aiVerdict = "CLEAN: no AI-written code found. No AI categories, agent files or model metadata.";
    if (aiPercentage >= 50) {
      aiVerdict = `CRITICAL: ${aiPercentage}% ${unit} written by AI or an agent. A clear break of the hand-written rule.`;
    } else if (aiPercentage >= 10) {
      aiVerdict = `HIGH RISK: ${aiPercentage}% ${unit} written by AI. Old-Vibe code has to be written by the maker.`;
    } else if (isAiDetected) {
      aiVerdict = `SUSPICIOUS: ${aiPercentage}% ${unit} written by AI, above the ${AI_TOLERANCE_PERCENT}% allowance. Inspect the commits.`;
    } else if (basis === "lines" && aiPercentage > 0) {
      aiVerdict = `WITHIN ALLOWANCE: ${aiPercentage}% ${unit} written by AI, under the ${AI_TOLERANCE_PERCENT}% allowance.`;
    }

    const aiAudit: AiDetectionAudit = {
      isAiDetected,
      basis,
      aiHeartbeatCount,
      aiPercentage,
      handcraftedPercentage,
      aiLines: attribution.aiLines,
      humanLines: attribution.humanLines,
      aiSessions: attribution.sessions,
      aiOutputTokens: attribution.outputTokens,
      aiEditorsDetected: Array.from(aiEditorsSet),
      aiReasons: [...evidence, ...Array.from(aiReasonsSet)],
      verdict: aiVerdict,
    };

    const writeRatio = Math.round((writeCount / rawHeartbeats.length) * 100);
    const noiseEntityRatio = Math.round((noiseEntitiesCount / rawHeartbeats.length) * 100);

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
    let suspiciousLineJumpsCount = 0;
    let pasteBurstCount = 0;

    // Track line jumps on write events across successive heartbeats
    const lastEntityLines = new Map<string, { lines: number; time: number }>();
    for (const hb of sortedHbs) {
      if (hb.entity && typeof hb.lines === "number") {
        const prev = lastEntityLines.get(hb.entity);
        if (prev !== undefined && hb.is_write) {
          const delta = hb.lines - prev.lines;
          if (Math.abs(delta) >= 350) {
            suspiciousLineJumpsCount++;
          }
          // Typing adds a few lines a minute. Dozens of new lines in seconds is a paste.
          if (delta >= 60 && hb.time - prev.time <= 20) {
            pasteBurstCount++;
          }
        }
        lastEntityLines.set(hb.entity, { lines: hb.lines, time: hb.time });
      }
    }

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
        if (intervalStdDevSeconds < 2.0 && validIntervals.length > 50) {
          isFixedIntervalSuspicious = true;
        }
      }

      if (burstCount > 50 && burstCount / validIntervals.length > 0.5) {
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

    let activeHoursCount = 0;
    for (const count of hourlyDistribution) {
      if (count > 0) activeHoursCount++;
    }
    const isZombieCodingSuspicious = activeHoursCount >= 22 && rawHeartbeats.length > 80;

    const singleFileAnomaly = (topEntity?.percentage ?? 0) > 95 && rawHeartbeats.length > 100;
    const idleBloatAnomaly = writeRatio < 5 && rawHeartbeats.length > 50;
    const isNoiseBloatSuspicious = noiseEntityRatio > 40 && rawHeartbeats.length > 50;
    const trustLvl = profile?.trust_factor?.trust_level;

    // High performance O(N + M) Two-Pointer Double Dipping Check
    let doubleDippingCount = 0;
    let doubleDippingMinutes = 0;
    const doubleDippingProjectsSet = new Set<string>();
    const overlappingDetails: string[] = [];

    if (allHeartbeats && allHeartbeats.length > 0) {
      const otherProjectHeartbeats = allHeartbeats.filter(
        (hb) =>
          hb.project &&
          !claimedSet.has(hb.project.trim().toLowerCase()) &&
          typeof hb.time === "number",
      );

      otherProjectHeartbeats.sort((a, b) => (a.time as number) - (b.time as number));

      let otherIdx = 0;
      const rawIntervals: [number, number][] = [];

      for (const hb of sortedHbs) {
        const t = hb.time;
        while (
          otherIdx < otherProjectHeartbeats.length &&
          (otherProjectHeartbeats[otherIdx].time as number) < t - 120
        ) {
          otherIdx++;
        }

        let scan = otherIdx;
        while (
          scan < otherProjectHeartbeats.length &&
          (otherProjectHeartbeats[scan].time as number) <= t + 120
        ) {
          const ohb = otherProjectHeartbeats[scan];
          if (ohb.project) {
            doubleDippingCount++;
            doubleDippingProjectsSet.add(ohb.project);
            rawIntervals.push([
              Math.max(t - 60, (ohb.time as number) - 60),
              Math.min(t + 60, (ohb.time as number) + 60),
            ]);
            if (overlappingDetails.length < 6) {
              const dtStrClaimed = new Date(t * 1000).toLocaleString("en-GB", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const dtStrOther = new Date((ohb.time as number) * 1000).toLocaleString("en-GB", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              overlappingDetails.push(
                `Claimed [${hb.project || "this"}] at ${dtStrClaimed} overlapped [${ohb.project}] at ${dtStrOther}`,
              );
            }
          }
          scan++;
        }
      }

      if (rawIntervals.length > 0) {
        rawIntervals.sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        let [curStart, curEnd] = rawIntervals[0];
        for (let k = 1; k < rawIntervals.length; k++) {
          const [nextStart, nextEnd] = rawIntervals[k];
          if (nextStart <= curEnd) {
            curEnd = Math.max(curEnd, nextEnd);
          } else {
            merged.push([curStart, curEnd]);
            curStart = nextStart;
            curEnd = nextEnd;
          }
        }
        merged.push([curStart, curEnd]);

        const totalOverlapSec = merged.reduce((acc, [s, e]) => acc + (e - s), 0);
        doubleDippingMinutes = Math.round(totalOverlapSec / 60);
      }
    }

    const idle = findIdleRuns(rawHeartbeats);
    const trackedSeconds = totalsFrom(rawHeartbeats).seconds;
    const trackedHours = trackedSeconds / 3600;
    const idleShare = trackedSeconds > 0 ? idle.idleSeconds / trackedSeconds : 0;
    const idleFlagged = idle.longestSeconds >= 30 * 60 || idleShare > 0.2;

    const changedLines = attribution.aiLines + attribution.humanLines;
    const reportsLines = rawHeartbeats.some(
      (h) => typeof h.human_line_changes === "number" || typeof h.ai_line_changes === "number",
    );
    const linesPerHour =
      reportsLines && trackedHours > 0 ? Math.round((changedLines / trackedHours) * 10) / 10 : null;
    // Forty hours for fifty lines. Only judged when the editor reports lines at all.
    const lowOutput = linesPerHour !== null && trackedHours >= 4 && linesPerHour < 4;

    // Authenticity Score & Reviewer Recommendation calculation
    let authenticityScore = 100;
    const decisionReasons: string[] = [];

    if (aiPercentage >= 50) {
      authenticityScore -= 90;
      decisionReasons.push(`Critical: ${aiPercentage}% ${unit} written by AI.`);
    } else if (aiPercentage >= 15) {
      authenticityScore -= 60;
      decisionReasons.push(`High: ${aiPercentage}% ${unit} written by AI.`);
    } else if (isAiDetected) {
      authenticityScore -= 30;
      decisionReasons.push(`${aiPercentage}% ${unit} written by AI, above the ${AI_TOLERANCE_PERCENT}% allowance.`);
    } else if (basis === "lines" && aiPercentage > 0) {
      decisionReasons.push(`${aiPercentage}% of changed lines written by AI, within the ${AI_TOLERANCE_PERCENT}% allowance.`);
    } else {
      decisionReasons.push("Verified hand-written code (no AI-written lines, categories or agent files).");
    }

    if (isFixedIntervalSuspicious) {
      authenticityScore -= 35;
      decisionReasons.push("Fixed-interval pulse detected (automated bot script).");
    }
    if (burstWarning) {
      authenticityScore -= 20;
      decisionReasons.push("Rapid-burst heartbeat injections detected.");
    }
    if (doubleDippingMinutes > 60) {
      authenticityScore -= 35;
      decisionReasons.push(`Significant cross-project overlap (${Math.round((doubleDippingMinutes / 60) * 10) / 10}h double-dipped).`);
    } else if (doubleDippingMinutes > 10) {
      authenticityScore -= 15;
      decisionReasons.push(`Minor cross-project overlap (${doubleDippingMinutes} min double-dipped).`);
    }
    if (isZombieCodingSuspicious) {
      authenticityScore -= 25;
      decisionReasons.push("Circadian anomaly: 24/7 coding active across day/night without biological sleep.");
    }
    if (isContinuousCodingSuspicious) {
      authenticityScore -= 20;
      decisionReasons.push(`Excessive continuous session (${maxContinuousHours}h without break).`);
    }
    if (idleFlagged) {
      authenticityScore -= idleShare > 0.4 ? 35 : 20;
      decisionReasons.push(
        `Idle editor activity: ${Math.round(idle.idleSeconds / 60)} min of writes with a frozen cursor (longest ${Math.round(idle.longestSeconds / 60)} min).`,
      );
    }
    if (lowOutput) {
      authenticityScore -= 10;
      decisionReasons.push(
        `Very little code for the time: ${changedLines} changed lines in ${trackedHours.toFixed(1)}h.`,
      );
    }
    if (pasteBurstCount >= 3) {
      authenticityScore -= pasteBurstCount >= 8 ? 25 : 12;
      decisionReasons.push(`Likely pasted code: ${pasteBurstCount} large additions within seconds.`);
    }
    if (suspiciousLineJumpsCount >= 5) {
      authenticityScore -= 20;
      decisionReasons.push(`Massive automated line dump spikes (${suspiciousLineJumpsCount} instances).`);
    }
    if (singleFileAnomaly) {
      authenticityScore -= 15;
      decisionReasons.push(`Camped on single file (${topEntity?.percentage}% of heartbeats).`);
    }
    if (idleBloatAnomaly) {
      authenticityScore -= 15;
      decisionReasons.push(`Very low active typing write ratio (${writeRatio}% writes).`);
    }
    if (isNoiseBloatSuspicious) {
      authenticityScore -= 15;
      decisionReasons.push(`High noise / build artifact ratio (${noiseEntityRatio}% noise files).`);
    }
    if (multiMachineCollisions > 2) {
      authenticityScore -= 15;
      decisionReasons.push(`Multi-device collisions (${multiMachineCollisions} conflicting heartbeats).`);
    }
    if (trustLvl === "red") {
      authenticityScore -= 30;
      decisionReasons.push("Hackatime trust factor is RED.");
    } else if (trustLvl === "yellow") {
      authenticityScore -= 15;
      decisionReasons.push("Hackatime trust factor is YELLOW.");
    }

    authenticityScore = Math.max(0, Math.min(100, authenticityScore));
    const riskScore = 100 - authenticityScore;
    const risk: "low" | "medium" | "high" =
      authenticityScore < 50 ? "high" : authenticityScore < 80 ? "medium" : "low";

    let recommendedDecision: "APPROVE" | "SCRUTINIZE" | "REJECT" = "APPROVE";
    if (authenticityScore < 45 || aiPercentage >= 25 || isFixedIntervalSuspicious) {
      recommendedDecision = "REJECT";
    } else if (
      authenticityScore < 80 ||
      doubleDippingMinutes > 15 ||
      idleBloatAnomaly ||
      isZombieCodingSuspicious ||
      suspiciousLineJumpsCount >= 3 ||
      pasteBurstCount >= 3 ||
      idleFlagged ||
      lowOutput
    ) {
      recommendedDecision = "SCRUTINIZE";
    }

    const totalClaimedSeconds = allProjects
      ? allProjects
          .filter((p) => claimedSet.has(p.key.toLowerCase()))
          .reduce((acc, p) => acc + p.seconds, 0)
      : 0;
    const cleanEstimatedHours = Math.max(
      0,
      Math.round(((totalClaimedSeconds - doubleDippingMinutes * 60) / 3600) * 10) / 10,
    );

    const signals: FraudSignal[] = [
      {
        label: "Double Dipping & Cross-Project Overlap",
        detail:
          doubleDippingCount > 0
            ? `FLAG: Found ${doubleDippingCount} overlapping heartbeats (~${doubleDippingMinutes} min) with other project(s): ${Array.from(doubleDippingProjectsSet).join(", ")}. Examples: ${overlappingDetails.slice(0, 3).join("; ")}`
            : "PASSED: No overlapping timestamps with other projects detected.",
        pass: doubleDippingCount === 0,
      },
      {
        label: "Hand-Written Code (Old-Vibe Core Rule)",
        detail: isAiDetected
          ? `VIOLATION: ${aiPercentage}% ${unit} written by AI. ${aiAudit.aiReasons.slice(0, 3).join(" ")}`
          : basis === "lines" && aiPercentage > 0
            ? `PASSED: ${aiPercentage}% ${unit} written by AI, within the ${AI_TOLERANCE_PERCENT}% allowance.`
            : "PASSED: no AI-written lines, categories, agent files or model metadata.",
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
        label: "Idle Editor Activity",
        detail:
          idle.runs.length > 0
            ? `Warning: ${idle.runs.length} stretch(es) of writes with the cursor frozen, ${Math.round(idle.idleSeconds / 60)} min in all (${Math.round(idleShare * 100)}% of tracked time). This is what an auto key presser leaves behind.`
            : "PASSED: the cursor moves while the editor records writes.",
        pass: !idleFlagged,
      },
      {
        label: "Output vs Time",
        detail:
          linesPerHour === null
            ? "Not checked: this editor does not report changed line counts."
            : lowOutput
              ? `Warning: only ${changedLines} changed lines in ${trackedHours.toFixed(1)}h (${linesPerHour} an hour).`
              : `${changedLines.toLocaleString()} changed lines in ${trackedHours.toFixed(1)}h (${linesPerHour} an hour).`,
        pass: !lowOutput,
      },
      {
        label: "Copy-Paste Detection",
        detail:
          pasteBurstCount > 0
            ? `Warning: ${pasteBurstCount} times 60+ lines appeared in one file within 20 seconds. Ask the maker to explain those parts.`
            : "PASSED: No pasted-in blocks detected. Lines grow at a typing pace.",
        pass: pasteBurstCount < 3,
      },
      {
        label: "Typing Velocity & Sudden Line Dumps",
        detail:
          suspiciousLineJumpsCount > 0
            ? `Warning: Detected ${suspiciousLineJumpsCount} sudden massive line spikes (>=350 lines). Max file lines: ${maxLineJump}.`
            : `Natural line development (max file lines: ${maxLineJump}, no massive line dump spikes).`,
        pass: suspiciousLineJumpsCount <= 2,
      },
      {
        label: "Circadian Rhythm & 24/7 Zombie Coding",
        detail: isZombieCodingSuspicious
          ? `Warning: Active in ${activeHoursCount}/24 hours. Uniform round-the-clock activity indicates bot process.`
          : `Healthy work rhythm (active in ${activeHoursCount}/24 daily hours, longest continuous session: ${maxContinuousHours}h).`,
        pass: !isZombieCodingSuspicious && !isContinuousCodingSuspicious,
      },
      {
        label: "Active Typing vs. Idle Focus",
        detail: idleBloatAnomaly
          ? `Warning: Only ${writeRatio}% writes (${writeCount} writes). High proportion of idle editor focus.`
          : `Healthy write ratio: ${writeRatio}% active keystroke writes (${writeCount}/${rawHeartbeats.length}).`,
        pass: !idleBloatAnomaly,
      },
      {
        label: "Source Code Depth vs Noise/Temp Files",
        detail: isNoiseBloatSuspicious
          ? `Warning: ${noiseEntityRatio}% of heartbeats logged in build artifacts, temp, or dependency files (${noiseEntitiesCount} hb).`
          : `Clean file targeting (${noiseEntitiesCount} build/noise hb, ${100 - noiseEntityRatio}% source code).`,
        pass: !isNoiseBloatSuspicious,
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
      authenticityScore,
      recommendedDecision,
      decisionReasons,
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
      activeHoursCount,
      isZombieCodingSuspicious,
      suspiciousLineJumpsCount,
      pasteBurstCount,
      idleMinutes: Math.round(idle.idleSeconds / 60),
      longestIdleMinutes: Math.round(idle.longestSeconds / 60),
      changedLines,
      linesPerHour,
      maxLineJump,
      noiseEntitiesCount,
      noiseEntityRatio,
      sessionClusters,
      multiMachineCollisions,
      doubleDippingCount,
      doubleDippingMinutes,
      doubleDippingProjects: Array.from(doubleDippingProjectsSet),
      doubleDippingDetails: overlappingDetails,
      cleanEstimatedHours,
      signals,
    };
  } else {
    fraudAnalysis = {
      risk: "medium",
      riskScore: 25,
      authenticityScore: 50,
      recommendedDecision: "SCRUTINIZE",
      decisionReasons: ["No heartbeats recorded for selected project."],
      aiAudit: {
        isAiDetected: false,
        basis: "heartbeats",
        aiHeartbeatCount: 0,
        aiPercentage: 0,
        handcraftedPercentage: 100,
        aiLines: 0,
        humanLines: 0,
        aiSessions: 0,
        aiOutputTokens: 0,
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
      activeHoursCount: 0,
      isZombieCodingSuspicious: false,
      suspiciousLineJumpsCount: 0,
      pasteBurstCount: 0,
      idleMinutes: 0,
      longestIdleMinutes: 0,
      changedLines: 0,
      linesPerHour: null,
      maxLineJump: 0,
      noiseEntitiesCount: 0,
      noiseEntityRatio: 0,
      sessionClusters: [],
      multiMachineCollisions: 0,
      doubleDippingCount: 0,
      doubleDippingMinutes: 0,
      doubleDippingProjects: [],
      doubleDippingDetails: [],
      cleanEstimatedHours: 0,
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
