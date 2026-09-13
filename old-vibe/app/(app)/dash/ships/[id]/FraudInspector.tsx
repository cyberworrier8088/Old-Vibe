"use client";

import { useState } from "react";
import type { HackatimeHeartbeat } from "@/lib/hackatime/client";
import type { FraudAnalysis } from "@/lib/hackatime/projects";
import styles from "./page.module.css";

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

export function FraudInspector({
  projectId,
  heartbeats = [],
  totalHeartbeatsCount = 0,
  fraudAnalysis,
  claimedProjects = [],
}: {
  projectId: string;
  heartbeats?: HackatimeHeartbeat[];
  totalHeartbeatsCount?: number;
  fraudAnalysis?: FraudAnalysis;
  claimedProjects?: string[];
}) {
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filteredHeartbeats = heartbeats.filter((hb) => {
    if (projectFilter !== "ALL" && (hb.project ?? "").toLowerCase() !== projectFilter.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const entity = (hb.entity ?? "").toLowerCase();
      const editor = (hb.editor ?? "").toLowerCase();
      const lang = (hb.language ?? "").toLowerCase();
      if (!entity.includes(q) && !editor.includes(q) && !lang.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredHeartbeats.length / pageSize));
  const pageItems = filteredHeartbeats.slice((page - 1) * pageSize, page * pageSize);

  const riskClass =
    fraudAnalysis?.risk === "high"
      ? styles.riskHigh
      : fraudAnalysis?.risk === "medium"
        ? styles.riskMedium
        : styles.riskLow;

  return (
    <div className={styles.fraudSection}>
      <div className={styles.fraudHeader}>
        <div className={styles.fraudTitleBlock}>
          <span className={styles.fraudTitleTag}>[INTERNAL FRAUD INSPECTOR]</span>
          <span className={`${styles.riskBadge} ${riskClass}`}>
            RISK ASSESSMENT: {fraudAnalysis?.risk ? fraudAnalysis.risk.toUpperCase() : "LOW"}
          </span>
        </div>

        <div className={styles.downloadTools}>
          <a
            href={`/api/admin/ships/${projectId}/heartbeats?format=json`}
            download
            className={styles.downloadBtn}
          >
            [DOWNLOAD JSON]
          </a>
          <a
            href={`/api/admin/ships/${projectId}/heartbeats?format=csv`}
            download
            className={styles.downloadBtn}
          >
            [EXPORT CSV]
          </a>
        </div>
      </div>

      {/* Fraud Signals Grid */}
      {fraudAnalysis?.signals && fraudAnalysis.signals.length > 0 ? (
        <div className={styles.signalsGrid}>
          {fraudAnalysis.signals.map((sig) => (
            <div
              key={sig.label}
              className={`${styles.signalCard} ${sig.pass ? styles.signalPass : styles.signalFail}`}
            >
              <div className={styles.signalHeader}>
                <span className={styles.signalLabel}>{sig.label}</span>
                <span className={styles.signalStatus}>
                  {sig.pass ? "[PASS]" : "[FLAG]"}
                </span>
              </div>
              <p className={styles.signalDetail}>{sig.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Heartbeat Data Stream Table */}
      <div className={styles.heartbeatsCard}>
        <div className={styles.heartbeatsCardHeader}>
          <div className={styles.streamTitle}>
            <span>RAW HEARTBEAT STREAM</span>
            <span className={styles.streamCount}>
              ({filteredHeartbeats.length} / {totalHeartbeatsCount || heartbeats.length} heartbeats)
            </span>
          </div>

          <div className={styles.streamControls}>
            <input
              type="text"
              placeholder="Search file, editor, language..."
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
                <option value="ALL">All Projects</option>
                {claimedProjects.map((cp) => (
                  <option key={cp} value={cp}>
                    {cp}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        {pageItems.length === 0 ? (
          <div className={styles.emptyStream}>
            No heartbeats match the current filters or query.
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.heartbeatTable}>
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>PROJECT</th>
                  <th>ENTITY / FILE</th>
                  <th>LANGUAGE</th>
                  <th>EDITOR & OS</th>
                  <th>CATEGORY</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((hb, idx) => {
                  const entity = hb.entity ?? "—";
                  const filename = entity.includes("/") ? entity.split("/").pop() : entity;
                  return (
                    <tr key={hb.id ? String(hb.id) : `${hb.time}-${idx}`}>
                      <td className={styles.tdTime}>{formatTimestamp(hb.time)}</td>
                      <td className={styles.tdProject}>{hb.project || "—"}</td>
                      <td className={styles.tdEntity} title={entity}>
                        <span className={styles.filenameText}>{filename}</span>
                        {entity !== filename ? (
                          <span className={styles.entityPathText}>{entity}</span>
                        ) : null}
                      </td>
                      <td className={styles.tdLang}>{hb.language || "—"}</td>
                      <td className={styles.tdEditor}>
                        {hb.editor || "—"} · {hb.operating_system || "—"}
                      </td>
                      <td className={styles.tdCat}>
                        <span
                          className={`${styles.categoryTag} ${
                            hb.category === "ai coding" ? styles.categoryAi : ""
                          }`}
                        >
                          {hb.category || "coding"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
