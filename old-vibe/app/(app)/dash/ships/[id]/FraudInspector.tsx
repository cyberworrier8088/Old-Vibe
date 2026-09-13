"use client";

import { useState, useMemo } from "react";
import type { HackatimeHeartbeat } from "@/lib/hackatime/client";
import type { FraudAnalysis } from "@/lib/hackatime/projects";
import type { SiblingProject } from "./ReviewTabs";
import styles from "./page.module.css";

const AI_EDITORS = [
  "antigravity",
  "antigravity-ide",
  "antigravityide",
  "antigravity-desktop",
  "cursor",
  "windsurf",
  "copilot",
  "cline",
  "continue",
  "aider",
  "devin",
  "zed-ai",
  "v0",
];

const AI_PATH_INDICATORS = [
  "antigravity ide",
  ".gemini",
  "/brain/",
  "\\brain\\",
  ".cursor",
  ".windsurf",
  ".continue",
  "task.md",
  "walkthrough.md",
  "implementation_plan.md",
  ".claude",
];

function isHeartbeatAi(hb: HackatimeHeartbeat): boolean {
  const cat = (hb.category ?? "").toLowerCase();
  const ed = (hb.editor ?? "").toLowerCase();
  const ent = (hb.entity ?? "").toLowerCase();

  if (cat.includes("ai") || cat.includes("copilot")) return true;
  for (const a of AI_EDITORS) {
    // We don't automatically flag just for using the editor, since they can type manually.
    // The category 'ai' or 'copilot' will catch actual AI generations.
  }
  for (const p of AI_PATH_INDICATORS) {
    if (ent.includes(p)) return true;
  }
  if ((hb as { ai_model?: string }).ai_model) return true;
  return false;
}

function formatTimestamp(timeOrStr?: number | string): string {
  if (!timeOrStr) return "—";
  const date = typeof timeOrStr === "number" ? new Date(timeOrStr * 1000) : new Date(timeOrStr);
  if (isNaN(date.getTime())) return String(timeOrStr);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function FraudInspector({
  projectId,
  heartbeats = [],
  totalHeartbeatsCount = 0,
  fraudAnalysis,
  claimedProjects = [],
  otherProjectsSummary = [],
  siblingProjects = [],
}: {
  projectId: string;
  heartbeats?: HackatimeHeartbeat[];
  totalHeartbeatsCount?: number;
  fraudAnalysis?: FraudAnalysis;
  claimedProjects?: string[];
  otherProjectsSummary?: { name: string; heartbeats: number }[];
  siblingProjects?: SiblingProject[];
}) {
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [writeOnly, setWriteOnly] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);
  const [selectedFileFilter, setSelectedFileFilter] = useState<string | null>(null);
  const [expandedHeartbeatId, setExpandedHeartbeatId] = useState<string | null>(null);
  const [showAllMakerDownloads, setShowAllMakerDownloads] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filteredHeartbeats = useMemo(() => {
    return heartbeats.filter((hb) => {
      if (
        projectFilter !== "ALL" &&
        (hb.project ?? "").toLowerCase() !== projectFilter.toLowerCase()
      ) {
        return false;
      }
      if (writeOnly && !hb.is_write) {
        return false;
      }
      if (aiOnly && !isHeartbeatAi(hb)) {
        return false;
      }
      if (selectedFileFilter && hb.entity !== selectedFileFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const entity = (hb.entity ?? "").toLowerCase();
        const editor = (hb.editor ?? "").toLowerCase();
        const lang = (hb.language ?? "").toLowerCase();
        const cat = (hb.category ?? "").toLowerCase();
        if (
          !entity.includes(q) &&
          !editor.includes(q) &&
          !lang.includes(q) &&
          !cat.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [heartbeats, projectFilter, writeOnly, aiOnly, selectedFileFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredHeartbeats.length / pageSize));
  const pageItems = filteredHeartbeats.slice((page - 1) * pageSize, page * pageSize);

  const riskClass =
    fraudAnalysis?.risk === "high"
      ? styles.riskHigh
      : fraudAnalysis?.risk === "medium"
        ? styles.riskMedium
        : styles.riskLow;

  const maxHourlyCount = useMemo(() => {
    if (!fraudAnalysis?.hourlyDistribution) return 1;
    return Math.max(1, ...fraudAnalysis.hourlyDistribution);
  }, [fraudAnalysis?.hourlyDistribution]);

  const aiAudit = fraudAnalysis?.aiAudit;

  return (
    <div className={styles.fraudSection}>
      {/* Top Header & Download Action Deck */}
      <div className={styles.fraudHeader}>
        <div className={styles.fraudTitleBlock}>
          <div className={styles.ariBrandTag}>
            <span className={styles.ariDot} />
            <strong>Fraud & Authenticity Audit</strong>
          </div>
          <div className={styles.riskBadgeContainer}>
            <span className={`${styles.riskBadge} ${riskClass}`}>
              Fraud Risk: {fraudAnalysis?.risk ? fraudAnalysis.risk.toUpperCase() : "LOW"} (Score:{" "}
              {fraudAnalysis?.riskScore ?? 0}/100)
            </span>
          </div>
        </div>

        {/* Real-time Download Tools */}
        <div className={styles.downloadTools}>
          <div className={styles.downloadButtonGroup}>
            <a
              href={`/api/admin/ships/${projectId}/heartbeats?format=json&scope=project`}
              download
              className={styles.downloadBtnPrimary}
              title="Download raw heartbeats for this project as JSON"
            >
              Project JSON
            </a>
            <a
              href={`/api/admin/ships/${projectId}/heartbeats?format=csv&scope=project`}
              download
              className={styles.downloadBtn}
              title="Export project heartbeats as CSV spreadsheet"
            >
              Project CSV
            </a>
            <button
              type="button"
              className={styles.downloadBtnAlt}
              onClick={() => setShowAllMakerDownloads((v) => !v)}
              title="Export all maker heartbeats across the entire event window"
            >
              All Maker Logs {showAllMakerDownloads ? "▴" : "▾"}
            </button>
          </div>

          {showAllMakerDownloads ? (
            <div className={styles.allMakerDropdown}>
              <div className={styles.dropdownHint}>
                Export full uncurated activity across all maker projects:
              </div>
              <div className={styles.dropdownLinks}>
                <a
                  href={`/api/admin/ships/${projectId}/heartbeats?format=json&scope=all`}
                  download
                  className={styles.dropdownLink}
                >
                  Download All Heartbeats (JSON)
                </a>
                <a
                  href={`/api/admin/ships/${projectId}/heartbeats?format=csv&scope=all`}
                  download
                  className={styles.dropdownLink}
                >
                  Export All Heartbeats (CSV)
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sibling Projects / Double Dipping Card */}
      {siblingProjects && siblingProjects.length > 0 ? (
        <div className={styles.doubleDipCard}>
          <div className={styles.doubleDipHeader}>
            <div className={styles.doubleDipTitleGroup}>
              <span className={styles.doubleDipIcon}>[!]</span>
              <div>
                <h3 className={styles.doubleDipTitle}>
                  Cross-Project Overlap Check
                </h3>
                <p className={styles.doubleDipSubtitle}>
                  This maker has {siblingProjects.length} other Old-Vibe submission(s). Review closely to ensure they are not claiming the same Hackatime project for multiple Old-Vibe ships.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.doubleDipList}>
            {siblingProjects.map(sp => {
              const hasOverlap = sp.hackatimeProjects.some(shp => claimedProjects.includes(shp));
              return (
                <div key={sp.id} className={[styles.doubleDipItem, hasOverlap ? styles.doubleDipItemOverlap : null].filter(Boolean).join(" ")}>
                  <div className={styles.doubleDipItemMain}>
                    <span className={styles.doubleDipItemTitle}>{sp.title}</span>
                    <span className={styles.doubleDipItemStatus}>{sp.decision?.toUpperCase() || "PENDING"}</span>
                  </div>
                  <div className={styles.doubleDipItemDetails}>
                    <span className={styles.doubleDipItemDetail}>
                      <strong>Hackatime:</strong> {sp.hackatimeProjects.join(", ") || "None"}
                    </span>
                    <span className={styles.doubleDipItemDetail}>
                      <strong>Tracked:</strong> {Math.round((sp.trackedSeconds / 3600) * 10) / 10}h
                    </span>
                  </div>
                  {hasOverlap ? (
                    <div className={styles.doubleDipWarning}>
                      FLAG: This project claims the exact same Hackatime project name as the current submission!
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Dedicated AI Coding Detection & Fraud Banner */}
      {aiAudit ? (
        <div
          className={[
            styles.aiDetectionCard,
            aiAudit.isAiDetected ? styles.aiDetectionFailed : styles.aiDetectionPassed,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.aiDetectionHeader}>
            <div className={styles.aiDetectionTitleGroup}>
              <span className={styles.aiDetectionIcon}>
                {aiAudit.isAiDetected ? "[!]" : "[OK]"}
              </span>
              <div>
                <h3 className={styles.aiDetectionTitle}>
                  {aiAudit.isAiDetected
                    ? `AI / Agent Scaffolding Detected (${aiAudit.aiPercentage}% AI Coded)`
                    : "Verified 100% Handcrafted Code"}
                </h3>
                <p className={styles.aiDetectionSubtitle}>
                  {aiAudit.verdict}
                </p>
              </div>
            </div>

            <div className={styles.aiRatioMeter}>
              <div className={styles.aiMeterLabels}>
                <span style={{ color: "#2ecc71" }}>
                  Handcrafted: {aiAudit.handcraftedPercentage}%
                </span>
                <span style={{ color: aiAudit.aiPercentage > 0 ? "#e74c3c" : "var(--muted)" }}>
                  AI Coded: {aiAudit.aiPercentage}%
                </span>
              </div>
              <div className={styles.aiMeterTrack}>
                <div
                  className={styles.aiMeterFillHand}
                  style={{ width: `${aiAudit.handcraftedPercentage}%` }}
                />
                <div
                  className={styles.aiMeterFillAi}
                  style={{ width: `${aiAudit.aiPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {aiAudit.isAiDetected ? (
            <div className={styles.aiTracesBox}>
              <span className={styles.aiTracesHeading}>
                Detected AI Traces & Indicators ({aiAudit.aiHeartbeatCount} flagged heartbeats):
              </span>
              <div className={styles.aiTracesPills}>
                {aiAudit.aiReasons.map((reason) => (
                  <span key={reason} className={styles.aiTracePill}>
                    {reason}
                  </span>
                ))}
              </div>
              <p className={styles.aiRuleViolationNote}>
                <strong>Old-Vibe Policy Violation:</strong> Old-Vibe rewards are strictly reserved for code written by hand. Projects utilizing automated AI agents (such as Antigravity IDE, Cursor, Windsurf, Copilot, or LLM code generators) are not eligible for approval.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fraud Stats Metrics Ribbon */}
      <div className={styles.ariStatsRibbon}>
        <div className={styles.statTile}>
          <span className={styles.statTileLabel}>AI Coding Detected</span>
          <span
            className={styles.statTileVal}
            style={{
              color: (aiAudit?.aiPercentage ?? 0) > 0 ? "#e74c3c" : "#2ecc71",
            }}
          >
            {aiAudit?.aiPercentage ?? 0}%
            <span className={styles.statTileSub}>
              ({aiAudit?.aiHeartbeatCount ?? 0} AI hb)
            </span>
          </span>
          <span className={styles.statTileSub2}>
            {(aiAudit?.aiPercentage ?? 0) > 0 ? "Violation detected" : "Handcrafted"}
          </span>
        </div>

        <div className={styles.statTile}>
          <span className={styles.statTileLabel}>Keystroke Writes</span>
          <span className={styles.statTileVal}>
            {fraudAnalysis?.writeRatio ?? 0}%
            <span className={styles.statTileSub}>
              ({fraudAnalysis?.writeCount ?? 0} writes)
            </span>
          </span>
          <div className={styles.statProgress}>
            <div
              className={styles.statProgressBar}
              style={{
                width: `${fraudAnalysis?.writeRatio ?? 0}%`,
                background:
                  (fraudAnalysis?.writeRatio ?? 0) < 20
                    ? "var(--bad)"
                    : "var(--highlight)",
              }}
            />
          </div>
        </div>

        <div className={styles.statTile}>
          <span className={styles.statTileLabel}>Cadence Variance</span>
          <span className={styles.statTileVal}>
            ±{fraudAnalysis?.intervalStdDevSeconds ?? 0}s
            <span className={styles.statTileSub}>
              {fraudAnalysis?.isFixedIntervalSuspicious ? "Fixed/Bot" : "Natural jitter"}
            </span>
          </span>
          <span className={styles.statTileSub2}>
            ~{fraudAnalysis?.averageIntervalMinutes ?? 2}m interval
          </span>
        </div>

        <div className={styles.statTile}>
          <span className={styles.statTileLabel}>Endurance / Sessions</span>
          <span className={styles.statTileVal}>
            {fraudAnalysis?.sessionClusters?.length ?? 0}
            <span className={styles.statTileSub}>sessions</span>
          </span>
          <span className={styles.statTileSub2}>
            Max continuous: {fraudAnalysis?.maxContinuousHours ?? 0}h
          </span>
        </div>
      </div>

      {/* 24-Hour Hourly Activity Punchcard Chart */}
      {fraudAnalysis?.hourlyDistribution && fraudAnalysis.hourlyDistribution.some((v) => v > 0) ? (
        <div className={styles.punchcardCard}>
          <div className={styles.punchcardHeader}>
            <div className={styles.punchcardTitle}>
              <span>24-Hour Activity Distribution</span>
              <span className={styles.punchcardSubtitle}>
                Histogram of active hours (00:00 to 23:00)
              </span>
            </div>
          </div>

          <div className={styles.histogramChart}>
            {fraudAnalysis.hourlyDistribution.map((count, hour) => {
              const heightPct = Math.max(6, Math.round((count / maxHourlyCount) * 100));
              return (
                <div key={hour} className={styles.histogramCol} title={`${hour}:00 - ${count} heartbeats`}>
                  <div className={styles.barTrack}>
                    <div
                      className={[
                        styles.barFill,
                        count === 0 ? styles.barZero : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={styles.hourLabel}>{hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Top Files Matrix (Click to Filter) */}
      {fraudAnalysis?.topEntities && fraudAnalysis.topEntities.length > 0 ? (
        <div className={styles.topEntitiesCard}>
          <div className={styles.topEntitiesHeader}>
            <span>Top Active Files</span>
            <span className={styles.topEntitiesHint}>
              Click a file to isolate heartbeats in table below:
            </span>
          </div>

          <div className={styles.entitiesList}>
            {fraudAnalysis.topEntities.map((ent) => {
              const isSelected = selectedFileFilter === ent.path;
              const shortName = ent.path.includes("/")
                ? ent.path.split("/").pop()
                : ent.path;
              return (
                <button
                  key={ent.path}
                  type="button"
                  onClick={() =>
                    setSelectedFileFilter(isSelected ? null : ent.path)
                  }
                  className={[
                    styles.entityChip,
                    isSelected ? styles.entityChipActive : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`Path: ${ent.path} (${ent.count} heartbeats, ${ent.writes} writes)`}
                >
                  <span className={styles.chipName}>{shortName}</span>
                  <span className={styles.chipBar}>
                    <span
                      className={styles.chipBarFill}
                      style={{ width: `${ent.percentage}%` }}
                    />
                  </span>
                  <span className={styles.chipPct}>{ent.percentage}%</span>
                  <span className={styles.chipWrites}>({ent.writes}w)</span>
                </button>
              );
            })}
            {selectedFileFilter ? (
              <button
                type="button"
                onClick={() => setSelectedFileFilter(null)}
                className={styles.clearFilterBtn}
              >
               Clear file filter
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Diagnostic Signals Checklist */}
      {fraudAnalysis?.signals && fraudAnalysis.signals.length > 0 ? (
        <div className={styles.signalsGrid}>
          {fraudAnalysis.signals.map((sig) => (
            <div
              key={sig.label}
              className={`${styles.signalCard} ${
                sig.pass ? styles.signalPass : styles.signalFail
              }`}
            >
              <div className={styles.signalHeader}>
                <span className={styles.signalLabel}>{sig.label}</span>
                <span className={styles.signalStatus}>
                  {sig.pass ? "PASS" : "FLAG"}
                </span>
              </div>
              <p className={styles.signalDetail}>{sig.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Session Clusters Timeline */}
      {fraudAnalysis?.sessionClusters && fraudAnalysis.sessionClusters.length > 0 ? (
        <div className={styles.sessionsCard}>
          <div className={styles.sessionsHeader}>
            <span>Detected Coding Sessions ({fraudAnalysis.sessionClusters.length})</span>
            <span className={styles.sessionsHint}>
              Separated by breaks &gt; 35 minutes
            </span>
          </div>

          <div className={styles.sessionPills}>
            {fraudAnalysis.sessionClusters.map((sess) => (
              <div key={sess.id} className={styles.sessionPill}>
                <span className={styles.sessDur}>
                  {formatDuration(sess.durationMinutes)}
                </span>
                <span className={styles.sessMeta}>
                  {sess.heartbeatsCount} hb · {sess.writesCount} writes
                </span>
                {sess.topLanguage ? (
                  <span className={styles.sessLang}>{sess.topLanguage}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Raw Heartbeat Stream Table with Controls */}
      <div className={styles.heartbeatsCard}>
        <div className={styles.heartbeatsCardHeader}>
          <div className={styles.streamTitle}>
            <span>Heartbeat Inspection Stream</span>
            <span className={styles.streamCount}>
              ({filteredHeartbeats.length} / {totalHeartbeatsCount || heartbeats.length} hb)
            </span>
            {selectedFileFilter ? (
              <span className={styles.activeFileBadge}>
                File: {selectedFileFilter.split("/").pop()}
              </span>
            ) : null}
          </div>

          <div className={styles.streamControls}>
            <label className={styles.writeToggleLabel}>
              <input
                type="checkbox"
                checked={writeOnly}
                onChange={(e) => {
                  setWriteOnly(e.target.checked);
                  setPage(1);
                }}
              />
              <span>Writes only</span>
            </label>

            <label className={styles.writeToggleLabel} style={{ color: "#e74c3c" }}>
              <input
                type="checkbox"
                checked={aiOnly}
                onChange={(e) => {
                  setAiOnly(e.target.checked);
                  setPage(1);
                }}
              />
              <span>AI only</span>
            </label>

            <input
              type="text"
              placeholder="Search file, editor, language, category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className={styles.streamSearch}
            />

            {claimedProjects.length > 1 ? (
              <select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setPage(1);
                }}
                className={styles.streamFilterSelect}
              >
                <option value="ALL">All Claimed Projects</option>
                {claimedProjects.map((cp) => (
                  <option key={cp} value={cp}>
                    {cp}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        {otherProjectsSummary.length > 0 ? (
          <div className={styles.excludedNotice}>
            <span>
              <strong>Filtered:</strong> Displaying heartbeats for claimed project{" "}
              <strong>{claimedProjects.join(", ") || "this project"}</strong>.
            </span>
          </div>
        ) : null}

        {pageItems.length === 0 ? (
          <div className={styles.emptyStream}>
            <p>
              No heartbeats found matching current filters (
              {aiOnly
                ? "AI only"
                : selectedFileFilter
                  ? `file: ${selectedFileFilter}`
                  : writeOnly
                    ? "writes only"
                    : searchQuery
                      ? `query: "${searchQuery}"`
                      : claimedProjects.join(", ") || "this project"}
              ).
            </p>
            {selectedFileFilter || writeOnly || aiOnly || searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedFileFilter(null);
                  setWriteOnly(false);
                  setAiOnly(false);
                  setSearchQuery("");
                }}
                className={styles.clearFilterBtn}
                style={{ marginTop: 8 }}
              >
                Reset Filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.heartbeatTable}>
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>PROJECT</th>
                  <th>FILE / ENTITY</th>
                  <th>WRITE</th>
                  <th>AI / CAT</th>
                  <th>LANGUAGE</th>
                  <th>EDITOR & OS</th>
                  <th>DETAILS</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((hb, idx) => {
                  const rowId = hb.id ? String(hb.id) : `${hb.time}-${idx}`;
                  const isExpanded = expandedHeartbeatId === rowId;
                  const isAi = isHeartbeatAi(hb);
                  const entity = hb.entity ?? "—";
                  const filename = entity.includes("/")
                    ? entity.split("/").pop()
                    : entity.includes("\\")
                      ? entity.split("\\").pop()
                      : entity;

                  return (
                    <tr
                      key={rowId}
                      className={[
                        isExpanded ? styles.trExpanded : null,
                        isAi ? styles.trAiRow : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className={styles.tdTime}>{formatTimestamp(hb.time)}</td>
                      <td className={styles.tdProject}>{hb.project || "—"}</td>
                      <td className={styles.tdEntity} title={entity}>
                        <span className={styles.filenameText}>{filename}</span>
                        {entity !== filename ? (
                          <span className={styles.entityPathText}>{entity}</span>
                        ) : null}
                      </td>
                      <td className={styles.tdWrite}>
                        <span
                          className={
                            hb.is_write ? styles.tagWrite : styles.tagRead
                          }
                        >
                          {hb.is_write ? "WRITE" : "READ"}
                        </span>
                      </td>
                      <td className={styles.tdCat}>
                        {isAi ? (
                          <span className={styles.tagAi}>
                          AI ({hb.category || "ai"})
                          </span>
                        ) : (
                          <span className={styles.tagNormal}>
                            {hb.category || "coding"}
                          </span>
                        )}
                      </td>
                      <td className={styles.tdLang}>{hb.language || "—"}</td>
                      <td className={styles.tdEditor}>
                        <span style={{ color: isAi ? "#e74c3c" : "inherit" }}>
                          {hb.editor || "—"}
                        </span>{" "}
                        · {hb.operating_system || "—"}
                      </td>
                      <td className={styles.tdActions}>
                        <button
                          type="button"
                          className={styles.inspectRowBtn}
                          onClick={() =>
                            setExpandedHeartbeatId(isExpanded ? null : rowId)
                          }
                          title="Inspect raw heartbeat object"
                        >
                          {isExpanded ? "Hide" : "Inspect"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {expandedHeartbeatId ? (
              <div className={styles.rawJsonDrawer}>
                <div className={styles.rawJsonHeader}>
                  <span>Raw Heartbeat Payload Inspection</span>
                  <button
                    type="button"
                    onClick={() => setExpandedHeartbeatId(null)}
                    className={styles.closeDrawerBtn}
                  >
                    Close
                  </button>
                </div>
                <pre className={styles.rawJsonPre}>
                  {JSON.stringify(
                    pageItems.find(
                      (h, idx) =>
                        (h.id ? String(h.id) : `${h.time}-${idx}`) ===
                        expandedHeartbeatId,
                    ) || {},
                    null,
                    2,
                  )}
                </pre>
              </div>
            ) : null}
          </div>
        )}

        {totalPages > 1 ? (
          <div className={styles.paginationBar}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={styles.pageBtn}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={styles.pageBtn}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
