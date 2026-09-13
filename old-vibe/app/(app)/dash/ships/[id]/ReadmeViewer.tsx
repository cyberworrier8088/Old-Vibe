"use client";

import { useState } from "react";
import styles from "./page.module.css";

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className={styles.readmeCodeBlock}>
            <code>{codeBlockBuffer.join("\n")}</code>
          </pre>,
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${i}`} className={styles.readmeH1}>
          {line.replace(/^#\s+/, "")}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className={styles.readmeH2}>
          {line.replace(/^##\s+/, "")}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className={styles.readmeH3}>
          {line.replace(/^###\s+/, "")}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={`li-${i}`} className={styles.readmeLi}>
          {line.replace(/^[-*]\s+/, "")}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} style={{ height: 8 }} />);
    } else {
      elements.push(
        <p key={`p-${i}`} className={styles.readmeP}>
          {line}
        </p>,
      );
    }
  }

  if (inCodeBlock && codeBlockBuffer.length > 0) {
    elements.push(
      <pre key="code-end" className={styles.readmeCodeBlock}>
        <code>{codeBlockBuffer.join("\n")}</code>
      </pre>,
    );
  }

  return elements;
}

export function ReadmeViewer({
  initialReadme,
  repoUrl,
  alternateRepoUrl,
  projectId,
}: {
  initialReadme: string | null;
  repoUrl: string | null;
  alternateRepoUrl?: string | null;
  projectId: string;
}) {
  const [mode, setMode] = useState<"formatted" | "raw">("formatted");
  const [expanded, setExpanded] = useState(false);
  const [activeRepo, setActiveRepo] = useState(repoUrl);
  const [readmeContent, setReadmeContent] = useState<string | null>(initialReadme);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [savingCanonical, setSavingCanonical] = useState(false);

  async function switchRepo(targetUrl: string) {
    setLoadingRepo(true);
    setActiveRepo(targetUrl);
    try {
      // Fetch readme for the selected target repo
      const slugMatch = targetUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (slugMatch) {
        const owner = slugMatch[1];
        const repo = slugMatch[2].replace(/\.git$/, "");
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`);
        if (res.ok) {
          const text = await res.text();
          setReadmeContent(text);
        } else {
          setReadmeContent(`[NOTICE] No README.md found in ${owner}/${repo}`);
        }
      }
    } catch {
      setReadmeContent("[ERROR] Failed to fetch repository README.");
    } finally {
      setLoadingRepo(false);
    }
  }

  async function saveCanonicalRepo(targetUrl: string) {
    setSavingCanonical(true);
    try {
      const res = await fetch(`/api/admin/ships/${projectId}/repo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: targetUrl }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setSavingCanonical(false);
    }
  }

  return (
    <div className={styles.readmeContainer}>
      <div className={styles.readmeTopBar}>
        <div className={styles.readmeHeaderLeft}>
          <span className={styles.readmeSectionTitle}>[README & CODE REPOSITORY]</span>
          {activeRepo ? (
            <a
              href={activeRepo}
              target="_blank"
              rel="noreferrer"
              className={styles.readmeRepoLink}
            >
              {activeRepo.replace(/^https?:\/\/github\.com\//, "")} ↗
            </a>
          ) : null}
        </div>

        <div className={styles.readmeControls}>
          <button
            type="button"
            className={`${styles.readmeBtn} ${mode === "formatted" ? styles.readmeBtnActive : ""}`}
            onClick={() => setMode("formatted")}
          >
            Formatted
          </button>
          <button
            type="button"
            className={`${styles.readmeBtn} ${mode === "raw" ? styles.readmeBtnActive : ""}`}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
          <button
            type="button"
            className={styles.readmeBtn}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Alternate Repo Switcher Notice (if mismatch exists, e.g. p-site vs My-Pety) */}
      {alternateRepoUrl && alternateRepoUrl !== repoUrl ? (
        <div className={styles.repoMismatchNotice}>
          <div className={styles.repoMismatchText}>
            <span>Detected Hackatime project repo match:</span>
            <strong>{alternateRepoUrl.replace(/^https?:\/\/github\.com\//, "")}</strong>
          </div>
          <div className={styles.repoMismatchActions}>
            <button
              type="button"
              className={styles.actionBtnSmall}
              onClick={() => switchRepo(alternateRepoUrl)}
              disabled={loadingRepo || activeRepo === alternateRepoUrl}
            >
              {activeRepo === alternateRepoUrl ? "[Viewing]" : "Inspect This Repo"}
            </button>
            <button
              type="button"
              className={styles.actionBtnSmallHighlight}
              onClick={() => saveCanonicalRepo(alternateRepoUrl)}
              disabled={savingCanonical}
            >
              {savingCanonical ? "Saving..." : "Set as Project Repo"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${styles.readmeCard} ${expanded ? styles.readmeExpanded : ""}`}>
        {loadingRepo ? (
          <div className={styles.readmeEmptyState}>Loading repository README...</div>
        ) : !readmeContent ? (
          <div className={styles.readmeEmptyState}>
            No README found at this repository address.
          </div>
        ) : mode === "formatted" ? (
          <div className={styles.readmeFormatted}>{renderMarkdown(readmeContent)}</div>
        ) : (
          <pre className={styles.readmeRaw}>{readmeContent}</pre>
        )}
      </div>
    </div>
  );
}
