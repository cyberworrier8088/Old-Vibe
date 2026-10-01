import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { ProjectStatusWord } from "@/components/ui/StatusWord";
import type { Project, ProjectJournal, User } from "@/lib/db/schema";
import { formatHours } from "@/lib/hackatime/projects";
import type { ProjectAuditBreakdown } from "@/lib/hackatime/projects";
import { projectStatus } from "@/lib/projects/status";

import { DecideJump } from "./DecideJump";
import { DecisionForm } from "./DecisionForm";
import type { ReviewEvidence } from "./EvidencePanel";
import { ReviewTabs } from "./ReviewTabs";
import type { SiblingProject } from "./ReviewTabs";
import { ViolationForm } from "./ViolationForm";
import type { ViolationEntry } from "./ViolationForm";
import styles from "./page.module.css";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TRUST_CLASS: Record<string, string | undefined> = {
  green: styles.trustGreen,
  blue: styles.trustBlue,
  yellow: styles.trustYellow,
  red: styles.trustRed,
};

/**
 * The review workstation's layout. It only draws what it is given: all loading happens in the page,
 * so this can also be rendered with sample data to check the layout on a phone.
 */
export function ReviewWorkstation({
  project,
  maker,
  audit,
  readme,
  review,
  journals,
  siblingProjects,
  nextInQueue,
  makerStreak,
  violations,
  moderationLog,
  banEnd,
}: {
  project: Project;
  maker: User;
  audit: ProjectAuditBreakdown;
  readme: Promise<string | null>;
  review: Promise<ReviewEvidence>;
  journals: ProjectJournal[];
  siblingProjects: SiblingProject[];
  nextInQueue: { id: string; title: string } | null;
  makerStreak: number;
  violations: number;
  moderationLog: ViolationEntry[];
  banEnd: string | null;
}) {
  const decided = Boolean(project.decision);

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

  // A repository named after the main Hackatime project may be the one the maker meant to submit.
  const ghUser =
    audit.profile?.github_username ||
    (project.repoUrl ? project.repoUrl.match(/github\.com\/([^/]+)/)?.[1] : null);
  const primaryHackatimeProject = project.hackatimeProjects[0];
  let alternateRepoUrl: string | null = null;
  if (ghUser && primaryHackatimeProject && project.repoUrl) {
    const candidate = `https://github.com/${ghUser}/${primaryHackatimeProject}`;
    if (candidate.toLowerCase() !== project.repoUrl.replace(/\.git$/i, "").toLowerCase()) {
      alternateRepoUrl = candidate;
    }
  }

  return (
    <AppShell title="Superviewer • Review">
      {/* On a phone this bar stays at the top while scrolling, so deciding is always one tap away. */}
      <nav className={styles.actionBar} aria-label="review">
        <Link href="/dash/ships" className={styles.backLink}>
          <span className={styles.wide}>← Back to Submissions Queue</span>
          <span className={styles.narrow}>← Queue</span>
        </Link>
        <div className={styles.actionBarLinks}>
          <DecideJump label={decided ? "Decision" : "Decide"} className={styles.decideJump} />
          {nextInQueue ? (
            <Link
              href={`/dash/ships/${nextInQueue.id}`}
              className={styles.nextLink}
              title={`Next: ${nextInQueue.title}`}
            >
              <span className={styles.wide}>Next in queue →</span>
              <span className={styles.narrow}>Next →</span>
            </Link>
          ) : null}
        </div>
      </nav>

      <div className={styles.headerDeck}>
        <div className={styles.headerMain}>
          <div>
            <div className={styles.eventRow}>
              <span className={styles.eventLabel}>Old-Vibe YSWS</span>
              <ProjectStatusWord status={projectStatus(project)} size="s" />
            </div>
            <h2 className={styles.projectTitleHeading}>{project.title}</h2>
            <div className={styles.submittedMeta}>
              Submitted {project.submittedAt ? WHEN.format(project.submittedAt) : "draft"} ·{" "}
              {totalHoursFormatted} tracked
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
                className={`${styles.trustBadge} ${TRUST_CLASS[trustLevel] ?? ""}`}
                title="Hackatime trust score"
              >
                Trust: {trustLevel.toUpperCase()} ({audit.profile.trust_factor.trust_value ?? 0})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.workstationGrid}>
        <div id="evidence" className={styles.leftColumn}>
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

        <div className={styles.rightColumn}>
          <div className={styles.stickyDeck}>
            <div id="decision" className={styles.decisionAnchor}>
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
                  trackedSeconds={audit.totalSeconds}
                  review={review}
                />
              </Panel>
            </div>

            <Panel>
              <PanelLabel>Rule Violation</PanelLabel>
              <ViolationForm
                projectId={project.id}
                makerName={maker.name}
                priorViolations={violations}
                banEnd={banEnd}
                history={moderationLog}
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
