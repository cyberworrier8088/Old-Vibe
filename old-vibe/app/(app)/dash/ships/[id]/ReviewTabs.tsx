"use client";

import { Suspense, useState } from "react";
import type { Project, ProjectJournal } from "@/lib/db/schema";
import type { ProjectAuditBreakdown } from "@/lib/hackatime/projects";
import { EvidenceBadge, EvidencePanel } from "./EvidencePanel";
import type { ReviewEvidence } from "./EvidencePanel";
import { ReadmeViewer } from "./ReadmeViewer";
import { FraudInspector } from "./FraudInspector";
import styles from "./page.module.css";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export type SiblingProject = {
  id: string;
  title: string;
  hackatimeProjects: string[];
  decision: string | null;
  approvedMinutes: number | null;
  trackedSeconds: number;
  submittedAt: Date | null;
};

/** The badge only appears once the README has arrived and turned out to exist. */
export function ReviewTabs({
  project,
  audit,
  readme,
  review,
  alternateRepoUrl,
  journals,
  totalHoursDecimal,
  totalHoursFormatted,
  siblingProjects = [],
}: {
  project: Project;
  audit: ProjectAuditBreakdown;
  /** Started by the server and streamed in, so the page does not wait on GitHub. */
  readme: Promise<string | null>;
  /** GitHub, other YSWS programs, demo link and the timeline. Streamed in. */
  review: Promise<ReviewEvidence>;
  alternateRepoUrl: string | null;
  journals: ProjectJournal[];
  totalHoursDecimal: number;
  totalHoursFormatted: string;
  siblingProjects?: SiblingProject[];
}) {
  const [activeTab, setActiveTab] = useState<"project" | "activity" | "fraud">("project");

  return (
    <div className={styles.tabsContainer}>
      {/* Navigation Tabs Bar */}
      <div className={styles.tabNav} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "project"}
          className={[styles.tabBtn, activeTab === "project" ? styles.tabBtnActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("project")}
        >
          <span className={styles.wide}>Project evidence</span>
          <span className={styles.narrow}>Evidence</span>
          <Suspense fallback={null}>
            <EvidenceBadge review={review} />
          </Suspense>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          className={[styles.tabBtn, activeTab === "activity" ? styles.tabBtnActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("activity")}
        >
          <span className={styles.wide}>Coding activity</span>
          <span className={styles.narrow}>Activity</span>
          <span className={styles.tabBadge}>{totalHoursFormatted}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "fraud"}
          className={[styles.tabBtn, activeTab === "fraud" ? styles.tabBtnActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("fraud")}
        >
          <span className={styles.wide}>Integrity review</span>
          <span className={styles.narrow}>Integrity</span>
          {audit.fraudAnalysis ? (
            <span
              className={[
                styles.tabRiskBadge,
                audit.fraudAnalysis.risk === "high"
                  ? styles.tabRiskHigh
                  : audit.fraudAnalysis.risk === "medium"
                    ? styles.tabRiskMedium
                    : styles.tabRiskLow,
              ].join(" ")}
            >
              {audit.fraudAnalysis.risk.toUpperCase()}
            </span>
          ) : null}
        </button>
      </div>

      {/* Project evidence */}
      {activeTab === "project" ? (
        <div className={styles.tabContent}>
          {project.thumbnailUrl ? (
            <div className={styles.screenshotCard}>
              <div className={styles.screenshotHeader}>
                <span>Project Screenshot</span>
                <a
                  href={project.thumbnailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.viewFullImg}
                >
                  View full image ↗
                </a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.thumbnailUrl}
                alt="Project screenshot"
                className={styles.screenshotImg}
              />
            </div>
          ) : null}

          {project.description ? (
            <div className={styles.descBox}>
              <h4 className={styles.sectionHeading}>Maker Description</h4>
              <p className={styles.descriptionText}>{project.description}</p>
            </div>
          ) : null}

          <div className={styles.quickActionLinks}>
            {project.repoUrl ? (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.quickActionBtn}
              >
                <span>Browse Repository</span>
                <span>↗</span>
              </a>
            ) : null}
            {project.demoUrl ? (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.quickActionBtnPrimary}
              >
                <span>Open Live Demo</span>
                <span>↗</span>
              </a>
            ) : null}
          </div>

          <Suspense
            fallback={
              <p className={styles.githubEvidenceEmpty} role="status">
                Checking GitHub, other YSWS programs and the demo link...
              </p>
            }
          >
            <EvidencePanel review={review} />
          </Suspense>

          <ReadmeViewer
            readme={readme}
            repoUrl={project.repoUrl}
            alternateRepoUrl={alternateRepoUrl}
            projectId={project.id}
          />

          {journals.length > 0 ? (
            <div className={styles.journalSection}>
              <h4 className={styles.sectionHeading}>
                Maker Dev Journals & Notes ({journals.length})
              </h4>
              <div className={styles.journalList}>
                {journals.map((j) => (
                  <div key={j.id} className={styles.journalCard}>
                    <div className={styles.journalTime}>{WHEN.format(j.createdAt)}</div>
                    <p className={styles.journalContent}>{j.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Coding activity */}
      {activeTab === "activity" ? (
        <div className={styles.tabContent}>
          <div className={styles.auditCard}>
            <div className={styles.auditHeader}>
              <div className={styles.auditTitle}>
                <span>Verified Coding Activity</span>
              </div>
              <div className={styles.auditTotal}>
                {totalHoursDecimal}h ({totalHoursFormatted})
              </div>
            </div>

            <div className={styles.cutoffNotice}>
              <strong>Cutoff Rule:</strong> Work logged prior to{" "}
              <span style={{ color: "var(--cream)" }}>11 Sep 2026</span> is excluded from rewards.
            </div>

            {audit.allLanguages && audit.allLanguages.length > 0 ? (
              <div className={styles.langSection}>
                <span className={styles.subLabel}>Languages Detected:</span>
                <div className={styles.langPills}>
                  {audit.allLanguages.map((lang) => (
                    <span key={lang} className={styles.langPill}>
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {audit.latestHeartbeat ? (
              <div className={styles.heartbeatBox}>
                <div className={styles.heartbeatRow}>
                  <span className={styles.heartbeatLabel}>Latest Recorded Heartbeat</span>
                  <span className={styles.heartbeatProject}>{audit.latestHeartbeat.project}</span>
                </div>
                {audit.latestHeartbeat.entity ? (
                  <div className={styles.heartbeatRow}>
                    <span className={styles.subLabel}>Active File:</span>
                    <span className={styles.heartbeatEntity}>{audit.latestHeartbeat.entity}</span>
                  </div>
                ) : null}
                <div className={styles.heartbeatRowSub}>
                  <span>
                    {audit.latestHeartbeat.editor || "Editor"} ·{" "}
                    {audit.latestHeartbeat.operating_system || "OS"}
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
                      <div className={styles.auditItemLangs}>{p.languages.join(", ")}</div>
                    ) : null}
                    <div
                      className={styles.auditItemNote}
                      style={{ color: p.eligible ? "var(--lilac)" : "var(--bad)" }}
                    >
                      {p.note}
                    </div>
                  </div>
                  <span className={styles.auditItemHours}>{p.hours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Integrity review */}
      {activeTab === "fraud" ? (
        <div className={styles.tabContent}>
          <FraudInspector
            projectId={project.id}
            heartbeats={audit.rawHeartbeats}
            totalHeartbeatsCount={audit.totalHeartbeatsCount}
            fraudAnalysis={audit.fraudAnalysis}
            claimedProjects={project.hackatimeProjects}
            otherProjectsSummary={audit.otherProjectsSummary}
            siblingProjects={siblingProjects}
          />
        </div>
      ) : null}
    </div>
  );
}
