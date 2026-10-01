"use client";

import { use } from "react";

import type { Evidence, Flag, TimelineEvent } from "@/lib/review/evidence";

import styles from "./EvidencePanel.module.css";

export type ReviewEvidence = { evidence: Evidence; events: TimelineEvent[]; flags: Flag[] };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const MATCH_LABEL = {
  "same-repo": "Same repository",
  "same-name": "Same name, other maker",
  "same-maker": "Same maker",
} as const;

function short(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** Counts what needs a reviewer's attention, for the tab label. */
export function EvidenceBadge({ review }: { review: Promise<ReviewEvidence> }) {
  const { flags } = use(review);
  if (flags.length === 0) return <span className={styles.badgeOk}>clear</span>;
  const bad = flags.some((flag) => flag.tone === "bad");
  return <span className={bad ? styles.badgeBad : styles.badgeWarn}>{flags.length}</span>;
}

export function EvidencePanel({ review }: { review: Promise<ReviewEvidence> }) {
  const { evidence, events, flags } = use(review);
  const { repo, priorShips, demo } = evidence;

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h4 className={styles.heading}>Needs attention</h4>
        {flags.length === 0 ? (
          <p className={styles.clear}>Nothing from GitHub, other YSWS programs or the demo link needs a look.</p>
        ) : (
          <ul className={styles.flags}>
            {flags.map((flag) => (
              <li key={flag.text} className={flag.tone === "bad" ? styles.flagBad : styles.flagWarn}>
                {flag.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h4 className={styles.heading}>Other YSWS programs</h4>
          <span className={styles.hint}>Hack Club unified YSWS database</span>
        </div>
        {priorShips === null ? (
          <p className={styles.empty}>The unified YSWS database could not be reached. Try reloading.</p>
        ) : priorShips.length === 0 ? (
          <p className={styles.empty}>No approved project in any other YSWS uses this repository or comes from this maker.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Match</th>
                  <th>Project</th>
                  <th>Hours</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {priorShips.map((ship) => (
                  <tr
                    key={`${ship.ysws}-${ship.codeUrl}-${ship.approvedAt}`}
                    className={ship.match === "same-repo" ? styles.rowBad : ship.match === "same-name" ? styles.rowWarn : undefined}
                  >
                    <td className={styles.program}>{ship.ysws}</td>
                    <td>{MATCH_LABEL[ship.match]}</td>
                    <td className={styles.link}>
                      <a href={ship.codeUrl} target="_blank" rel="noreferrer">
                        {short(ship.codeUrl)}
                      </a>
                    </td>
                    <td className={styles.num}>{ship.hours ?? "?"}</td>
                    <td className={styles.num}>{ship.approvedAt ? DAY.format(new Date(ship.approvedAt * 1000)) : "?"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h4 className={styles.heading}>Timeline</h4>
          <span className={styles.hint}>All times UTC</span>
        </div>
        <ol className={styles.timeline}>
          {events.map((event) => (
            <li
              key={`${event.label}-${event.at}`}
              className={event.tone === "bad" ? styles.eventBad : event.tone === "warn" ? styles.eventWarn : styles.event}
            >
              <time className={styles.when} dateTime={new Date(event.at).toISOString()}>
                {WHEN.format(new Date(event.at))}
              </time>
              <span className={styles.what}>
                {event.href ? (
                  <a href={event.href} target="_blank" rel="noreferrer">
                    {event.label}
                  </a>
                ) : (
                  event.label
                )}
                {event.detail ? <span className={styles.detail}>{event.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h4 className={styles.heading}>GitHub</h4>
          {repo ? (
            <a className={styles.hint} href={`${repo.htmlUrl}/commits`} target="_blank" rel="noreferrer">
              full history
            </a>
          ) : null}
        </div>
        {!repo ? (
          <p className={styles.empty}>No public GitHub repository could be read.</p>
        ) : (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>Commits</dt>
                <dd>{repo.commitCount ?? "?"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{repo.createdAt ? DAY.format(new Date(repo.createdAt)) : "?"}</dd>
              </div>
              <div>
                <dt>Fork</dt>
                <dd>{repo.fork ? (repo.parent ?? "yes") : "no"}</dd>
              </div>
              <div>
                <dt>Authors</dt>
                <dd>{repo.authors.join(", ") || "?"}</dd>
              </div>
            </dl>
            {repo.recent.length > 0 ? (
              <ol className={styles.commits}>
                {repo.recent.map((commit) => (
                  <li key={commit.sha}>
                    <a href={commit.url} target="_blank" rel="noreferrer">
                      {commit.message || "Untitled commit"}
                    </a>
                    <span className={styles.detail}>
                      {[commit.author, commit.date ? WHEN.format(new Date(commit.date)) : null, commit.sha.slice(0, 7)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </section>

      {demo ? (
        <section className={styles.section}>
          <h4 className={styles.heading}>Demo link</h4>
          <p className={demo.ok ? styles.clear : styles.problem}>
            <a href={demo.url} target="_blank" rel="noreferrer">
              {short(demo.url)}
            </a>{" "}
            {demo.ok ? `loads (${demo.status}).` : demo.problem}
          </p>
        </section>
      ) : null}
    </div>
  );
}
