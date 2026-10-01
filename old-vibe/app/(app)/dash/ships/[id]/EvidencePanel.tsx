"use client";

import { use } from "react";

import type { Evidence, Flag, PriorShip, TimelineEvent } from "@/lib/review/evidence";
import type { CheckTone, ForensicCheck } from "@/lib/review/forensics";

import styles from "./EvidencePanel.module.css";

export type ReviewEvidence = {
  evidence: Evidence;
  events: TimelineEvent[];
  flags: Flag[];
  /** Commit, file and history checks from lib/review/forensics.ts. */
  forensics: ForensicCheck[];
  /** Tracked hours that commits back up, for a one-click deflation. Null when unknown. */
  commitBackedHours: number | null;
  /** YYYY-MM-DD; only work after it counts. */
  eventStart: string;
  /** Evidence-based hour justification for the unified YSWS database, minus the decision line. */
  justification: string;
};

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

const CHECK_CLASS: Record<CheckTone, string | undefined> = {
  ok: styles.checkOk,
  warn: styles.checkWarn,
  bad: styles.checkBad,
  unknown: styles.checkUnknown,
};

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

function ShipTable({ ships, start }: { ships: PriorShip[]; start: number }) {
  return (
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
          {ships.map((ship) => {
            const before = ship.approvedAt !== null && ship.approvedAt * 1000 < start;
            const tone =
              ship.match === "same-repo"
                ? before
                  ? styles.rowWarn
                  : styles.rowBad
                : ship.match === "same-name"
                  ? styles.rowWarn
                  : undefined;
            return (
              <tr key={`${ship.ysws}-${ship.codeUrl}-${ship.approvedAt}`} className={tone}>
                <td className={styles.program}>{ship.ysws}</td>
                <td className={styles.match}>{MATCH_LABEL[ship.match]}</td>
                <td className={styles.link}>
                  <a href={ship.codeUrl} target="_blank" rel="noreferrer">
                    {short(ship.codeUrl)}
                  </a>
                </td>
                <td className={`${styles.num} ${styles.hours}`}>{ship.hours != null ? `${ship.hours}h` : "?"}</td>
                <td className={`${styles.num} ${styles.approved}`}>
                  <span className={styles.cellLabel}>approved </span>
                  {ship.approvedAt ? DAY.format(new Date(ship.approvedAt * 1000)) : "?"}
                  <span className={before ? styles.before : styles.during}>
                    {ship.approvedAt === null ? "" : before ? "before Old-Vibe" : "during Old-Vibe"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EvidencePanel({ review }: { review: Promise<ReviewEvidence> }) {
  const { evidence, events, flags, forensics, eventStart } = use(review);
  const { repo, priorShips, demo } = evidence;
  const start = Date.parse(`${eventStart}T00:00:00Z`);
  const thisProject = (priorShips ?? []).filter((ship) => ship.match !== "same-maker");
  const makersOther = (priorShips ?? []).filter((ship) => ship.match === "same-maker");
  const makersOtherBefore = makersOther.filter((ship) => ship.approvedAt !== null && ship.approvedAt * 1000 < start);

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h4 className={styles.heading}>Needs attention</h4>
        {flags.length === 0 ? (
          <p className={styles.clear}>Nothing from GitHub, Hackatime, other YSWS programs or the demo link needs a look.</p>
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
          <h4 className={styles.heading}>Fraud checks</h4>
          <span className={styles.hint}>GitHub against Hackatime, since {DAY.format(start)}</span>
        </div>
        <ul className={styles.checks}>
          {forensics.map((check) => (
            <li key={check.key} className={CHECK_CLASS[check.tone]}>
              <div className={styles.checkHead}>
                <span className={styles.checkLabel}>{check.label}</span>
                <span className={styles.checkValue}>{check.value}</span>
              </div>
              <p className={styles.checkDetail}>{check.detail}</p>
              {check.items && check.items.length > 0 ? (
                <ul className={styles.checkItems}>
                  {check.items.map((item) => (
                    <li key={item.text}>
                      {item.href ? (
                        <a href={item.href} target="_blank" rel="noreferrer">
                          {item.text}
                        </a>
                      ) : (
                        item.text
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h4 className={styles.heading}>Other YSWS programs</h4>
          <span className={styles.hint}>Hack Club unified YSWS database</span>
        </div>
        {priorShips === null ? (
          <p className={styles.empty}>The unified YSWS database did not answer in time. It keeps downloading in the background, so reload in a minute.</p>
        ) : (
          <>
            {thisProject.length === 0 ? (
              <p className={styles.clear}>No other program approved this repository, or one with its name.</p>
            ) : (
              <ShipTable ships={thisProject} start={start} />
            )}
            {makersOther.length > 0 ? (
              <details className={styles.others}>
                <summary>
                  The maker&apos;s other YSWS projects: {makersOther.length}
                  {makersOtherBefore.length > 0 ? `, ${makersOtherBefore.length} before Old-Vibe started` : ""}
                </summary>
                <p className={styles.empty}>
                  Different repositories. Only one approved while Old-Vibe ran could share hours with this project.
                </p>
                <ShipTable ships={makersOther} start={start} />
              </details>
            ) : null}
          </>
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
