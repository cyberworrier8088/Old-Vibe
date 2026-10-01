import Link from "next/link";

import { ProjectStatusWord } from "@/components/ui/StatusWord";
import type { Project, User } from "@/lib/db/schema";
import { hoursLabel } from "@/lib/paper";
import { projectStatus } from "@/lib/projects/status";
import { waiting } from "@/lib/review/queue";

import styles from "./page.module.css";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** The submissions table. On a phone the stylesheet lays each row out as a card. */
export function QueueTable({ rows, now }: { rows: Array<{ project: Project; maker: User }>; now: Date }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Maker</th>
            <th>Project</th>
            <th>Submitted</th>
            <th>Hours</th>
            <th>Status</th>
            <th className={styles.right}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, maker }) => {
            const status = projectStatus(project);
            const isQueued = status === "queued";
            return (
              <tr key={project.id} className={isQueued ? styles.rowQueued : undefined}>
                <td className={styles.cellMaker}>
                  <span className={styles.maker}>{maker.name}</span>
                  <span className={styles.sub}>@{maker.slackId}</span>
                </td>
                <td className={styles.cellProject}>
                  <Link href={`/dash/ships/${project.id}`} className={styles.projectLink}>
                    {project.title}
                  </Link>
                  <span className={styles.sub}>
                    Hackatime: {project.hackatimeProjects.join(", ") || "none claimed"}
                  </span>
                </td>
                <td className={styles.cellWhen}>
                  {project.submittedAt ? WHEN.format(project.submittedAt) : ""}
                  {project.submittedAt && isQueued ? (
                    <span className={`${styles.sub} ${styles[`wait_${waiting(project.submittedAt, now).tone}`]}`}>
                      waiting {waiting(project.submittedAt, now).label}
                    </span>
                  ) : null}
                </td>
                <td className={styles.cellHours}>
                  {project.approvedMinutes != null ? (
                    <span style={{ color: "var(--ok)", fontWeight: 600 }}>
                      {hoursLabel(project.approvedMinutes)}h approved
                    </span>
                  ) : project.trackedSeconds > 0 ? (
                    <span style={{ color: "var(--cream)", opacity: 0.9 }}>
                      {Math.round((project.trackedSeconds / 3600) * 10) / 10}h tracked
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={styles.cellStatus}>
                  <ProjectStatusWord status={status} size="s" />
                </td>
                <td className={`${styles.cellAction} ${styles.right}`}>
                  <Link
                    href={`/dash/ships/${project.id}`}
                    className={isQueued ? styles.actionReviewPrimary : styles.actionReview}
                  >
                    {isQueued ? "Review" : "Inspect"} →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
