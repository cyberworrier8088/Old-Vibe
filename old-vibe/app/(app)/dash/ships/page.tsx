import { desc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { ProjectStatusWord } from "@/components/ui/StatusWord";
import { hoursLabel } from "@/lib/paper";
import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { projectStatus } from "@/lib/projects/status";
import type { ProjectStatus } from "@/lib/status";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Superviewer • Submissions" };
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const FILTERS: { key: string; label: string; matches: (status: ProjectStatus) => boolean }[] = [
  { key: "open", label: "waiting", matches: (status) => status === "queued" },
  { key: "draft", label: "draft", matches: (status) => status === "draft" },
  { key: "all", label: "all projects", matches: () => true },
  { key: "approved", label: "approved", matches: (status) => status === "approved" },
  { key: "changes", label: "changes asked", matches: (status) => status === "changes" },
  { key: "rejected", label: "not approved", matches: (status) => status === "rejected" },
];

export default async function ShipsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  if (!(await requireOrganizer())) notFound();

  const { filter } = await searchParams;
  const active = FILTERS.find((option) => option.key === filter) ?? FILTERS[0];

  const rows = await getDb()
    .select({ project: projects, maker: users })
    .from(projects)
    .innerJoin(users, eq(projects.userSub, users.sub))
    .orderBy(desc(projects.createdAt));

  // Compute count for each filter tab
  const filterCounts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = rows.filter((r) => f.matches(projectStatus(r.project))).length;
    return acc;
  }, {});

  const shown = rows.filter((row) => active.matches(projectStatus(row.project)));

  return (
    <AppShell title="Superviewer • Submissions Queue">
      <nav className={styles.filters} aria-label="filter submissions">
        {FILTERS.map((option) => {
          const count = filterCounts[option.key] ?? 0;
          return (
            <Link
              key={option.key}
              href={`/dash/ships?filter=${option.key}`}
              className={[styles.filter, option.key === active.key ? styles.on : null]
                .filter(Boolean)
                .join(" ")}
              aria-current={option.key === active.key ? "page" : undefined}
            >
              <span>{option.label}</span>
              <span className={styles.filterCount}>{count}</span>
            </Link>
          );
        })}
      </nav>

      <Panel>
        <PanelLabel>
          {shown.length === 1 ? "1 submission" : `${shown.length} submissions`}
        </PanelLabel>
        {shown.length === 0 ? (
          <p className={styles.none}>Nothing here.</p>
        ) : (
          <div className={styles.wrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>maker</th>
                  <th>project</th>
                  <th>submitted</th>
                  <th>hours</th>
                  <th>status</th>
                  <th style={{ textAlign: "right" }}>action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ project, maker }) => {
                  const status = projectStatus(project);
                  const isQueued = status === "queued";
                  return (
                    <tr key={project.id} className={isQueued ? styles.rowQueued : undefined}>
                      <td>
                        <span className={styles.maker}>{maker.name}</span>
                        <span className={styles.sub}>@{maker.slackId}</span>
                      </td>
                      <td>
                        <Link href={`/dash/ships/${project.id}`} className={styles.projectLink}>
                          {project.title}
                        </Link>
                        <span className={styles.sub}>
                          {project.hackatimeProjects.join(", ") || "no hackatime projects"}
                        </span>
                      </td>
                      <td>{project.submittedAt ? WHEN.format(project.submittedAt) : ""}</td>
                      <td>
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
                      <td>
                        <ProjectStatusWord status={status} size="s" />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/dash/ships/${project.id}`}
                          className={isQueued ? styles.actionReviewPrimary : styles.actionReview}
                        >
                          {isQueued ? "Review →" : "Inspect →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
