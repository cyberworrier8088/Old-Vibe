"use client";

import { useState } from "react";
import type { Project, ProjectJournal, User } from "@/lib/db/schema";
import type { ProjectAuditBreakdown } from "@/lib/hackatime/projects";
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

export function ReviewTabs({
  project,
  maker: _maker,
  audit,
  readme,
  alternateRepoUrl,
  journals,
  totalHoursDecimal,
  totalHoursFormatted,
  siblingProjects = [],
}: {
  project: Project;
  maker?: User;
  audit: ProjectAuditBreakdown;
  readme: string | null;
  alternateRepoUrl: string | null;
  journals: ProjectJournal[];
  totalHoursDecimal: number;
  totalHoursFormatted: string;
  siblingProjects?: SiblingProject[];
}) {
  const [activeTab, setActiveTab] = useState<"readme" | "hackatime" | "fraud">("readme");

  return (
    <div className={styles.tabsContainer}>
      {/* Navigation Tabs Bar */}
      <div className={styles.tabNav} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "readme"}
          className={[styles.tabBtn, activeTab === "readme" ? styles.tabBtnActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("readme")}
        >
          <span>Overview and README</span>
          {readme ? <span className={styles.tabBadge}>Verified</span> : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "hackatime"}
          className={[styles.tabBtn, activeTab === "hackatime" ? styles.tabBtnActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("hackatime")}
        >
          <span>Hackatime Audit</span>
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
          <span>Authenticity and Fraud</span>
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

      {/* Tab 1: Overview & README */}
      {activeTab === "readme" ? (
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

          <ReadmeViewer
            initialReadme={readme}
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

      {/* Tab 2: Hackatime Audit & Heartbeats */}
      {activeTab === "hackatime" ? (
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
                      style={{ color: p.eligible ? "var(--muted)" : "var(--bad)" }}
                    >
                      {p.note}
                    </div>
                  </div>
                  <span className={styles.auditItemHours}>{p.hours}</span>
                </div>
              ))}
            </div>
          </div>

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

      {/* Tab 3: Fraud & Authenticity */}
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
