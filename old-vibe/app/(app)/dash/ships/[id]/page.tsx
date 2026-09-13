import { and, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { ProjectStatusWord } from "@/components/ui/StatusWord";
import { PaperIcon } from "@/components/ui/PaperIcon";
import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, projectJournals, users } from "@/lib/db/schema";
import { projectStatus } from "@/lib/projects/status";
import { formatHours, getMakerProjectBreakdown } from "@/lib/hackatime/projects";
import { paperRateForStreak } from "@/lib/rewards";
import { fetchRepoReadmeContent } from "@/lib/superviewer/repo";

import { DecisionForm } from "./DecisionForm";
import { ReviewTabs } from "./ReviewTabs";
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

  // Fetch verified Hackatime audit & heartbeats with cutoff before 11-9-2026 enforced
  const [audit, readme] = await Promise.all([
    getMakerProjectBreakdown(maker, project.hackatimeProjects),
    project.repoUrl ? fetchRepoReadmeContent(project.repoUrl) : Promise.resolve(null),
  ]);

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

            {maker.streak > 0 ? (
              <span className={styles.streakBadge} title="Current coding streak">
                {maker.streak}d streak
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
            maker={maker}
            audit={audit}
            readme={readme}
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
                makerStreak={maker.streak}
                makerName={maker.name}
                initialDecided={decided}
                initialDecision={project.decision}
                initialApprovedMinutes={project.approvedMinutes}
                initialNote={project.noteToMaker}
              />
            </Panel>

            <Panel>
              <PanelLabel>Maker Overview</PanelLabel>
              <div className={styles.makerOverviewList}>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Email</span>
                  <span className={styles.overviewVal}>{maker.email}</span>
                </div>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Hackatime Project(s)</span>
                  <span className={styles.overviewVal}>
                    {project.hackatimeProjects.join(", ") || "None"}
                  </span>
                </div>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Tracked Eligible</span>
                  <span className={styles.overviewValHighlight}>
                    {totalHoursFormatted} ({totalHoursDecimal}h)
                  </span>
                </div>
                <div className={styles.overviewItem}>
                  <span className={styles.overviewKey}>Paper Bonus Rate</span>
                  <span
                    className={styles.overviewVal}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    {paperRateForStreak(maker.streak).toFixed(1)} <PaperIcon size={14} /> / hr
                  </span>
                </div>
              </div>
            </Panel>

            <div className={styles.guidelinesBox}>
              <div className={styles.guidelinesTitle}>Old-Vibe Review Checklist</div>
              <ul className={styles.guidelinesList}>
                <li>No AI-generated scaffolding or LLM code wrappers.</li>
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
