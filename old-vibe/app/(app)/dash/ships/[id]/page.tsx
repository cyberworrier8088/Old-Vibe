import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { Banner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import { ProjectStatusWord } from "@/components/ui/StatusWord";
import { hoursLabel } from "@/lib/beans";
import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects, projectJournals, users } from "@/lib/db/schema";
import { projectStatus } from "@/lib/projects/status";

import { DecisionForm } from "./DecisionForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "review" };
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

  return (
    <AppShell title={project.title}>
      <div className={styles.split}>
        <Panel>
          <PanelLabel>the submission</PanelLabel>
          {project.thumbnailUrl ? (
            <div style={{ margin: "16px 0", borderRadius: 8, overflow: "hidden", border: "1px solid var(--rule)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.thumbnailUrl}
                alt="Project screenshot"
                style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
              />
            </div>
          ) : null}
          {project.description ? <p className={styles.description} style={{ whiteSpace: "pre-wrap" }}>{project.description}</p> : null}
          <div className={styles.facts}>
            <div className={styles.fact}>
              <span>maker</span>
              <span>
                {maker.name} · {maker.slackId}
              </span>
            </div>
            <div className={styles.fact}>
              <span>email</span>
              <span>{maker.email}</span>
            </div>
            <div className={styles.fact}>
              <span>hackatime</span>
              <span>{project.hackatimeProjects.join(", ") || "none"}</span>
            </div>
            <div className={styles.fact}>
              <span>sent</span>
              <span>{project.submittedAt ? WHEN.format(project.submittedAt) : "not sent"}</span>
            </div>
            <div className={styles.fact}>
              <span>status</span>
              <span>
                <ProjectStatusWord status={projectStatus(project)} size="s" />
              </span>
            </div>
          </div>
          <div className={styles.choices}>
            {project.repoUrl ? (
              <ButtonLink href={project.repoUrl} variant="quiet">
                repo
              </ButtonLink>
            ) : null}
            {project.demoUrl ? (
              <ButtonLink href={project.demoUrl} variant="quiet">
                demo
              </ButtonLink>
            ) : null}
          </div>

          {journals.length > 0 ? (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
              <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", marginBottom: 12 }}>
                Maker Dev Notes & Journals ({journals.length})
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {journals.map((j) => (
                  <div key={j.id} style={{ background: "var(--raised)", padding: 12, borderRadius: 6, border: "1px solid var(--rule)" }}>
                    <div style={{ fontSize: 11, fontFamily: "var(--data)", color: "var(--muted)", marginBottom: 4 }}>
                      {WHEN.format(j.createdAt)}
                    </div>
                    <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{j.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <PanelLabel>{decided ? "decided" : "record a decision"}</PanelLabel>
          {decided ? (
            <Banner tone={project.decision === "approved" ? "ok" : "warn"}>
              {project.decision === "approved"
                ? `Approved for ${hoursLabel(project.approvedMinutes)} hours.`
                : `Recorded as ${project.decision}.`}
              {project.noteToMaker ? ` "${project.noteToMaker}"` : ""}
            </Banner>
          ) : !project.submittedAt ? (
            <Banner tone="warn">This is still a draft, so there is nothing to decide.</Banner>
          ) : (
            <DecisionForm id={project.id} trackedProjects={project.hackatimeProjects.length} />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
