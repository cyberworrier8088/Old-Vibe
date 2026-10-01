import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, projectJournals, users } from "@/lib/db/schema";
import { EVENT_START_DATE, getMakerProjectBreakdown } from "@/lib/hackatime/projects";
import { saveStreak } from "@/lib/hackatime/streak";
import { banStatus, formatBanEnd } from "@/lib/ladder";
import { countViolations, historyFor } from "@/lib/moderation";
import { buildTimeline, gatherEvidence } from "@/lib/review/evidence";
import { buildJustification } from "@/lib/review/justification";
import { fetchRepoReadmeContent } from "@/lib/superviewer/repo";

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

  const [row] = await getDb()
    .select({ project: projects, maker: users })
    .from(projects)
    .innerJoin(users, eq(projects.userSub, users.sub))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) notFound();
  const { project, maker } = row;

  const journals = await getDb()
    .select()
    .from(projectJournals)
    .where(eq(projectJournals.projectId, id));

  // Query sibling projects by same maker for double-dipping detection
  const siblingProjects = await getDb()
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
    .where(and(eq(projects.userSub, project.userSub), ne(projects.id, id)));

  // The next submission in the queue (oldest first) that is not this one.
  const [nextInQueue] = await getDb()
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(isNotNull(projects.submittedAt), isNull(projects.decision), ne(projects.id, id)))
    .orderBy(asc(projects.submittedAt))
    .limit(1);

  const [violations, moderationLog] = await Promise.all([
    countViolations(maker.sub),
    historyFor(maker.sub),
  ]);
  const ban = banStatus(maker);

  // Outside lookups start now and stream into the page, so a slow GitHub or unified database
  // never holds it up. Neither promise rejects.
  const readme = project.repoUrl ? fetchRepoReadmeContent(project.repoUrl) : Promise.resolve(null);
  const evidence = gatherEvidence({
    repoUrl: project.repoUrl,
    demoUrl: project.demoUrl,
    githubUsername: null,
    slackId: maker.slackId,
  });

  // Fetch verified Hackatime audit & heartbeats with cutoff before 11-9-2026 enforced
  const audit = await getMakerProjectBreakdown(maker, project.hackatimeProjects);

  const review = evidence.then((found) => {
    const timeline = buildTimeline({
      evidence: found,
      eventStart: EVENT_START_DATE,
      submittedAt: project.submittedAt ? project.submittedAt.toISOString() : null,
      firstHeartbeatAt: audit.firstHeartbeatAt ?? null,
      lastHeartbeatAt: audit.lastHeartbeatAt ?? null,
      makerGithub: audit.profile?.github_username ?? null,
    });
    const fraud = audit.fraudAnalysis;
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
      flags: timeline.flags,
    });
    return { evidence: found, ...timeline, justification };
  });

  const makerStreak =
    typeof audit.streakDays === "number"
      ? await saveStreak(maker.sub, audit.streakDays, maker.streak)
      : maker.streak;

  return (
    <ReviewWorkstation
      project={project}
      maker={maker}
      audit={audit}
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
