import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, projectJournals, users } from "@/lib/db/schema";
import { EVENT_START_DATE, getMakerProjectBreakdown } from "@/lib/hackatime/projects";
import { saveStreak } from "@/lib/hackatime/streak";
import { banStatus, formatBanEnd } from "@/lib/ladder";
import { countViolations, historyFor } from "@/lib/moderation";
import { buildTimeline, gatherEvidence } from "@/lib/review/evidence";
import { analyseForensics } from "@/lib/review/forensics";
import { buildJustification } from "@/lib/review/justification";
import { fetchRepoForensicData, fetchRepoReadmeContent } from "@/lib/superviewer/repo";

import { ReviewWorkstation } from "./ReviewWorkstation";

export const metadata: Metadata = { title: "Superviewer • Review Workstation" };
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOrganizer())) notFound();

  const { id } = await params;
  const db = getDb();

  const [row] = await db
    .select({ project: projects, maker: users })
    .from(projects)
    .innerJoin(users, eq(projects.userSub, users.sub))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) notFound();
  const { project, maker } = row;

  // Outside lookups start first and stream into the page, so a slow GitHub or unified database
  // never holds it up. None of these promises rejects.
  const readme = project.repoUrl ? fetchRepoReadmeContent(project.repoUrl) : Promise.resolve(null);
  const evidence = gatherEvidence({
    repoUrl: project.repoUrl,
    demoUrl: project.demoUrl,
    githubUsername: null,
    slackId: maker.slackId,
  });
  const forensicData = project.repoUrl ? fetchRepoForensicData(project.repoUrl) : Promise.resolve(null);

  // Everything else needs only the project, so it runs at once rather than one query after another:
  // each trip to a hosted database costs a few hundred milliseconds.
  const [journals, siblingProjects, [nextInQueue], violations, moderationLog, audit] = await Promise.all([
    db.select().from(projectJournals).where(eq(projectJournals.projectId, id)),
    // The maker's other projects, for the double dipping check.
    db
      .select({
        id: projects.id,
        title: projects.title,
        hackatimeProjects: projects.hackatimeProjects,
        decision: projects.decision,
        approvedMinutes: projects.approvedMinutes,
        trackedSeconds: projects.trackedSeconds,
        submittedAt: projects.submittedAt,
      })
      .from(projects)
      .where(and(eq(projects.userSub, project.userSub), ne(projects.id, id))),
    // The next submission in the queue (oldest first) that is not this one.
    db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(isNotNull(projects.submittedAt), isNull(projects.decision), ne(projects.id, id)))
      .orderBy(asc(projects.submittedAt))
      .limit(1),
    countViolations(maker.sub),
    historyFor(maker.sub),
    // Hackatime, counting only work since the start.
    getMakerProjectBreakdown(maker, project.hackatimeProjects),
  ]);
  const ban = banStatus(maker);

  // The page shows the streak Hackatime reports now; storing it can happen after the response.
  const makerStreak =
    typeof audit.streakDays === "number" ? Math.max(0, Math.floor(audit.streakDays)) : maker.streak;
  if (makerStreak !== maker.streak) after(() => saveStreak(maker.sub, makerStreak, maker.streak));

  // The edited file list only feeds the checks below; the page itself does not need it.
  const { entityPaths = [], ...auditForPage } = audit;

  const review = Promise.all([evidence, forensicData]).then(([found, data]) => {
    const fraud = audit.fraudAnalysis;
    const timeline = buildTimeline({
      evidence: found,
      eventStart: EVENT_START_DATE,
      submittedAt: project.submittedAt ? project.submittedAt.toISOString() : null,
      firstHeartbeatAt: audit.firstHeartbeatAt ?? null,
      lastHeartbeatAt: audit.lastHeartbeatAt ?? null,
      makerGithub: audit.profile?.github_username ?? null,
    });
    const forensics = analyseForensics({
      data,
      entityPaths,
      sessions: fraud?.sessionClusters ?? [],
      trackedSeconds: audit.totalSeconds,
      eventStart: EVENT_START_DATE,
    });
    const flags = [...timeline.flags, ...forensics.flags];
    const justification = buildJustification({
      hackatimeProjects: project.hackatimeProjects,
      trackedSeconds: audit.totalSeconds,
      firstHeartbeatAt: audit.firstHeartbeatAt ?? null,
      lastHeartbeatAt: audit.lastHeartbeatAt ?? null,
      sessions: fraud?.sessionClusters.length ?? 0,
      longestSessionHours: fraud?.maxContinuousHours ?? 0,
      ai: fraud
        ? {
            basis: fraud.aiAudit.basis,
            percentage: fraud.aiAudit.aiPercentage,
            aiLines: fraud.aiAudit.aiLines,
            humanLines: fraud.aiAudit.humanLines,
          }
        : null,
      writeRatio: fraud ? fraud.writeRatio : null,
      idleMinutes: fraud?.idleMinutes ?? 0,
      pasteBursts: fraud?.pasteBurstCount ?? 0,
      doubleDipMinutes: fraud?.doubleDippingMinutes ?? 0,
      repo: found.repo,
      priorShips: found.priorShips,
      demo: found.demo,
      forensics: forensics.checks,
      eventStart: EVENT_START_DATE,
      flags,
    });
    return {
      evidence: found,
      events: timeline.events,
      flags,
      forensics: forensics.checks,
      // The tracked hours scaled by the share of sessions a commit backs up.
      commitBackedHours:
        forensics.commitBackedShare === null
          ? null
          : Math.round(audit.totalDecimalHours * forensics.commitBackedShare * 10) / 10,
      eventStart: EVENT_START_DATE,
      justification,
    };
  });

  return (
    <ReviewWorkstation
      project={project}
      maker={maker}
      audit={auditForPage}
      readme={readme}
      review={review}
      journals={journals}
      siblingProjects={siblingProjects}
      nextInQueue={nextInQueue ?? null}
      makerStreak={makerStreak}
      violations={violations}
      moderationLog={moderationLog.slice(0, 5).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        reason: entry.reason,
        when: WHEN.format(entry.createdAt),
      }))}
      banEnd={ban.banned ? formatBanEnd(ban) : null}
    />
  );
}
