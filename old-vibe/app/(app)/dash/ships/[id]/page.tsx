import { and, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { ProjectStatusWord } from "@/components/ui/StatusWord";
import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, projectJournals, users } from "@/lib/db/schema";
import { projectStatus } from "@/lib/projects/status";
import { EVENT_START_DATE, formatHours, getMakerProjectBreakdown } from "@/lib/hackatime/projects";
import { saveStreak } from "@/lib/hackatime/streak";
import { banStatus, formatBanEnd } from "@/lib/ladder";
import { countViolations, historyFor } from "@/lib/moderation";
import { buildTimeline, gatherEvidence } from "@/lib/review/evidence";
import { fetchRepoReadmeContent } from "@/lib/superviewer/repo";

import { DecisionForm } from "./DecisionForm";
import { ReviewTabs } from "./ReviewTabs";
import { ViolationForm } from "./ViolationForm";
import styles from "./page.module.css";

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
  const decided = Boolean(project.decision);

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

  const review = evidence.then((found) => ({
    evidence: found,
    ...buildTimeline({
      evidence: found,
      eventStart: EVENT_START_DATE,
      submittedAt: project.submittedAt ? project.submittedAt.toISOString() : null,
      firstHeartbeatAt: audit.firstHeartbeatAt ?? null,
      lastHeartbeatAt: audit.lastHeartbeatAt ?? null,
      makerGithub: audit.profile?.github_username ?? null,
    }),
  }));

  const makerStreak =
    typeof audit.streakDays === "number"
      ? await saveStreak(maker.sub, audit.streakDays, maker.streak)
      : maker.streak;

  const totalHoursDecimal =
    audit.totalDecimalHours > 0
      ? audit.totalDecimalHours
      : project.trackedSeconds > 0
        ? Math.round((project.trackedSeconds / 3600) * 10) / 10
        : 0;
  const totalHoursFormatted =
    audit.totalHours !== "0h"
      ? audit.totalHours
      : project.trackedSeconds > 0
        ? formatHours(project.trackedSeconds)
        : "0h";

  const trustLevel = audit.profile?.trust_factor?.trust_level ?? "unknown";
  const trustBadgeClass =
    trustLevel === "green"
      ? styles.trustGreen
      : trustLevel === "blue"
        ? styles.trustBlue
        : trustLevel === "yellow"
          ? styles.trustYellow
          : trustLevel === "red"
            ? styles.trustRed
            : "";

  // Check if there is an alternate repo matching the Hackatime project
  const ghUser =
    audit.profile?.github_username ||
    (project.repoUrl ? project.repoUrl.match(/github\.com\/([^/]+)/)?.[1] : null);
  const primaryHackatimeProject = project.hackatimeProjects[0];
  let alternateRepoUrl: string | null = null;
  if (ghUser && primaryHackatimeProject) {
    const candidate = `https://github.com/${ghUser}/${primaryHackatimeProject}`;
    if (
      project.repoUrl &&
      candidate.toLowerCase() !== project.repoUrl.replace(/\.git$/i, "").toLowerCase()
    ) {
      alternateRepoUrl = candidate;
    }
  }

  const currentStatus = projectStatus(project);

  return (
    <AppShell title={`Review • ${project.title}`}>
      {/* Top Header Deck */}
      <div className={styles.headerDeck}>
        <div className={styles.headerTopRow}>
          <Link href="/dash/ships" className={styles.backLink}>
            ← Back to Submissions Queue
          </Link>
          <div className={styles.headerStatusRow}>
            <ProjectStatusWord status={currentStatus} size="m" />
          </div>
        </div>

        <div className={styles.headerMain}>
          <div>
            <div className={styles.eventLabel}>Old-Vibe YSWS</div>
            <h1 className={styles.projectTitleHeading}>{project.title}</h1>
            <div className={styles.submittedMeta}>
              Submitted {project.submittedAt ? WHEN.format(project.submittedAt) : "draft"}
            </div>
          </div>

          <div className={styles.headerQuickBadges}>
            <a
              href={`https://hackclub.slack.com/team/${maker.slackId}`}
              target="_blank"
              rel="noreferrer"
              className={styles.makerSlackBadge}
              title="Open Maker profile on Hack Club Slack"
            >
              <span>{maker.name}</span>
              <span className={styles.slackHandle}>@{maker.slackId} ↗</span>
            </a>

            {audit.profile?.github_username ? (
              <a
                href={`https://github.com/${audit.profile.github_username}`}
                target="_blank"
                rel="noreferrer"
                className={styles.makerGhBadge}
                title="Open GitHub profile"
              >
                <span>GitHub:</span>
                <span>@{audit.profile.github_username} ↗</span>
              </a>
            ) : null}

            {makerStreak > 0 ? (
              <span className={styles.streakBadge} title="Current coding streak">
                {makerStreak}d streak
              </span>
            ) : null}

            {audit.profile?.trust_factor ? (
              <span
                className={`${styles.trustBadge} ${trustBadgeClass}`}
                title="Hackatime trust score"
              >
                Trust: {trustLevel.toUpperCase()} ({audit.profile.trust_factor.trust_value ?? 0})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Two-Column Workstation Layout */}
      <div className={styles.workstationGrid}>
        {/* Left Column: Primary Inspection Workstation */}
        <div className={styles.leftColumn}>
          <ReviewTabs
            project={project}
            audit={audit}
            readme={readme}
            review={review}
            alternateRepoUrl={alternateRepoUrl}
            journals={journals}
            totalHoursDecimal={totalHoursDecimal}
            totalHoursFormatted={totalHoursFormatted}
            siblingProjects={siblingProjects}
          />
        </div>

        {/* Right Column: Sticky Review Action Deck */}
        <div className={styles.rightColumn}>
          <div className={styles.stickyDeck}>
            <Panel>
              <PanelLabel>{decided ? "Review Decision" : "Record Decision"}</PanelLabel>
              <DecisionForm
                id={project.id}
                trackedProjects={project.hackatimeProjects.length}
                defaultHours={totalHoursDecimal}
                totalTrackedFormatted={totalHoursFormatted}
                makerStreak={makerStreak}
                makerName={maker.name}
                initialDecided={decided}
                initialDecision={project.decision}
                initialApprovedMinutes={project.approvedMinutes}
                initialNote={project.noteToMaker}
              />
            </Panel>

            <Panel>
              <PanelLabel>Rule Violation</PanelLabel>
              <ViolationForm
                projectId={project.id}
                makerName={maker.name}
                priorViolations={violations}
                banEnd={ban.banned ? formatBanEnd(ban) : null}
                history={moderationLog.slice(0, 5).map((entry) => ({
                  id: entry.id,
                  kind: entry.kind,
                  reason: entry.reason,
                  when: WHEN.format(entry.createdAt),
                }))}
              />
            </Panel>

            <Panel>
              <PanelLabel>Submission details</PanelLabel>
              <div className={styles.makerOverviewList}>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>YSWS</span>
                  <span className={styles.overviewVal}>Old-Vibe</span>
                </div>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Maker email</span>
                  <span className={styles.overviewVal}>{maker.email}</span>
                </div>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Claimed Hackatime projects</span>
                  <span className={styles.overviewVal}>
                    {project.hackatimeProjects.join(", ") || "None"}
                  </span>
                </div>
              </div>
            </Panel>

            <div className={styles.guidelinesBox}>
              <div className={styles.guidelinesTitle}>Old-Vibe Review Checklist</div>
              <ul className={styles.guidelinesList}>
                <li>No AI-written code, agent output or pasted code. An AI-enabled editor alone is fine.</li>
                <li>Commit history shows real iteration, not one large drop.</li>
                <li>Verify commit activity occurred during the valid event window.</li>
                <li>Confirm repo and live demo are accessible and functional.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
