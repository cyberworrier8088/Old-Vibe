import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { projectStatus } from "@/lib/projects/status";
import { waiting } from "@/lib/review/queue";
import { warmUnifiedIndex } from "@/lib/review/unified";
import type { ProjectStatus } from "@/lib/status";

import { QueueTable } from "./QueueTable";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Superviewer • Submissions" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; matches: (status: ProjectStatus) => boolean }[] = [
  { key: "open", label: "Needs review", matches: (status) => status === "queued" },
  { key: "draft", label: "Drafts", matches: (status) => status === "draft" },
  { key: "all", label: "All submissions", matches: () => true },
  { key: "approved", label: "Approved", matches: (status) => status === "approved" },
  { key: "changes", label: "Changes requested", matches: (status) => status === "changes" },
  { key: "rejected", label: "Not approved", matches: (status) => status === "rejected" },
];

export default async function ShipsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  if (!(await requireOrganizer())) notFound();
  // Reviews check every submission against the unified YSWS database; start loading it now.
  warmUnifiedIndex();

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
  // The queue is first come, first served: the longest-waiting maker is reviewed next.
  if (active.key === "open") {
    shown.sort((a, b) => (a.project.submittedAt?.getTime() ?? 0) - (b.project.submittedAt?.getTime() ?? 0));
  }
  const now = new Date();
  const oldest = active.key === "open" && shown[0]?.project.submittedAt ? waiting(shown[0].project.submittedAt, now) : null;
  const overdue = shown.filter((row) => row.project.submittedAt && projectStatus(row.project) === "queued" && waiting(row.project.submittedAt, now).tone === "bad").length;

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
        <div className={styles.queueHead}>
          <PanelLabel>
            {shown.length === 1 ? "1 submission" : `${shown.length} submissions`}
          </PanelLabel>
          {oldest ? (
            <span className={styles.queueStat}>
              oldest waiting <b className={styles[`wait_${oldest.tone}`]}>{oldest.label}</b>
              {overdue > 0 ? ` · ${overdue} over a week` : ""}
            </span>
          ) : null}
          {active.key === "open" && shown[0] ? (
            <Link href={`/dash/ships/${shown[0].project.id}`} className={styles.actionReviewPrimary}>
              Start with the oldest →
            </Link>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <p className={styles.none}>Nothing here.</p>
        ) : (
          <QueueTable rows={shown} now={now} />
        )}
      </Panel>
    </AppShell>
  );
}
