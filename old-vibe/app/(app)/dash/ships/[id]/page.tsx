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

import { formatHours, getMakerProjectBreakdown } from "@/lib/hackatime/projects";
import { fetchRepoReadmeContent } from "@/lib/superviewer/repo";

import { DecisionForm } from "./DecisionForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Superviewer • Review" };
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

  return (
    <AppShell title={`Superviewer • ${project.title}`}>
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
                <a
                  href={`https://hackclub.slack.com/team/${maker.slackId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--lamp)", textDecoration: "underline" }}
                  title="Open in Hack Club Slack"
                >
                  {maker.name} (@{maker.slackId}) ↗
                </a>
              </span>
            </div>
            {audit.profile?.trust_factor ? (
              <div className={styles.fact}>
                <span>trust factor</span>
                <span>
                  <span className={`${styles.trustBadge} ${trustBadgeClass}`}>
                    🛡️ {trustLevel} (score: {audit.profile.trust_factor.trust_value ?? 0})
                  </span>
                </span>
              </div>
            ) : null}
            {audit.profile?.github_username ? (
              <div className={styles.fact}>
                <span>github user</span>
                <span>
                  <a
                    href={`https://github.com/${audit.profile.github_username}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--lamp)", textDecoration: "underline" }}
                  >
                    @{audit.profile.github_username} ↗
                  </a>
                </span>
              </div>
            ) : null}
            {audit.streakDays != null && audit.streakDays > 0 ? (
              <div className={styles.fact}>
                <span>coding streak</span>
                <span>🔥 {audit.streakDays} days in a row</span>
              </div>
            ) : null}
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

          {/* Superviewer Hackatime Audit & Heartbeat Card */}
          {project.hackatimeProjects.length > 0 ? (
            <div className={styles.auditCard}>
              <div className={styles.auditHeader}>
                <div className={styles.auditTitle}>
                  <span>⚡</span>
                  <span>Hackatime Audit</span>
                </div>
                <div className={styles.auditTotal}>{totalHoursDecimal}h ({totalHoursFormatted})</div>
              </div>
              <div className={styles.cutoffNotice}>
                📅 Cutoff Rule: Hours logged before <strong>11 Sep 2026</strong> are automatically excluded.
              </div>

              {audit.allLanguages && audit.allLanguages.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>Languages Detected:</span>
                  <div className={styles.langPills}>
                    {audit.allLanguages.map((lang) => (
                      <span key={lang} className={styles.langPill}>
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Heartbeat Inspection Box */}
              {audit.latestHeartbeat ? (
                <div className={styles.heartbeatBox}>
                  <div className={styles.heartbeatRow}>
                    <span style={{ color: "#f5a623", fontWeight: 600 }}>💓 Latest Heartbeat</span>
                    <span style={{ color: "var(--soft)" }}>{audit.latestHeartbeat.project}</span>
                  </div>
                  {audit.latestHeartbeat.entity ? (
                    <div className={styles.heartbeatRow}>
                      <span style={{ color: "var(--muted)" }}>Active File:</span>
                      <span className={styles.heartbeatEntity}>{audit.latestHeartbeat.entity}</span>
                    </div>
                  ) : null}
                  <div className={styles.heartbeatRow} style={{ color: "var(--muted)", fontSize: 11 }}>
                    <span>
                      {audit.latestHeartbeat.editor || "Editor"} · {audit.latestHeartbeat.operating_system || "OS"}
                    </span>
                    <span>{audit.latestHeartbeat.language || "Code"}</span>
                  </div>
                </div>
              ) : null}

              <div className={styles.auditList}>
                {audit.projects.map((p) => (
                  <div key={p.key} className={styles.auditItem}>
                    <div>
                      <span className={styles.auditItemName}>{p.key}</span>
                      {p.languages && p.languages.length > 0 ? (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {p.languages.join(", ")}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: p.eligible ? "var(--muted)" : "var(--bad)" }}>
                        {p.note}
                      </div>
                    </div>
                    <span className={styles.auditItemHours}>{p.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.choices} style={{ marginTop: 16 }}>
            {project.repoUrl ? (
              <ButtonLink href={project.repoUrl} variant="quiet" target="_blank" rel="noreferrer">
                view repo ↗
              </ButtonLink>
            ) : null}
            {project.demoUrl ? (
              <ButtonLink href={project.demoUrl} variant="quiet" target="_blank" rel="noreferrer">
                live demo ↗
              </ButtonLink>
            ) : null}
          </div>

          {/* Embedded README reader */}
          {readme ? (
            <div className={styles.readmeContainer}>
              <div className={styles.readmeTitle}>
                <span>📖 Project README & Code Docs</span>
                <span style={{ fontSize: 11, fontFamily: "var(--data)" }}>GitHub</span>
              </div>
              <pre className={styles.readmeContent}>{readme}</pre>
            </div>
          ) : null}

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
            <DecisionForm
              id={project.id}
              trackedProjects={project.hackatimeProjects.length}
              defaultHours={totalHoursDecimal}
              totalTrackedFormatted={totalHoursFormatted}
            />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
