import type { Flag } from "./evidence";
import type { DemoCheck, PriorShip, RepoFacts } from "./evidence";

/**
 * Writes the hour justification the unified YSWS database asks for. Hack Club's reviewers reject
 * generic ones ("hours were recorded in Hackatime and verified by X"); what passes is specific
 * evidence: which Hackatime projects, over what dates, in how many sessions, what the commits show,
 * and why anything was cut. Pure, so it is testable and always matches what the reviewer saw.
 */

export type JustificationInput = {
  hackatimeProjects: string[];
  trackedSeconds: number;
  firstHeartbeatAt: number | null;
  lastHeartbeatAt: number | null;
  sessions: number;
  longestSessionHours: number;
  ai: { basis: "lines" | "heartbeats"; percentage: number; aiLines: number; humanLines: number } | null;
  writeRatio: number | null;
  idleMinutes: number;
  pasteBursts: number;
  doubleDipMinutes: number;
  repo: RepoFacts | null;
  priorShips: PriorShip[] | null;
  demo: DemoCheck | null;
  flags: Flag[];
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (epochMs: number) => DAY.format(new Date(epochMs));
const hours = (seconds: number) => `${Math.round((seconds / 3600) * 10) / 10}h`;

function section(title: string, lines: (string | null | false | undefined)[]): string | null {
  const kept = lines.filter((line): line is string => Boolean(line && line.trim()));
  return kept.length ? `${title}\n${kept.map((line) => `- ${line}`).join("\n")}` : null;
}

export function buildJustification(input: JustificationInput): string {
  const span =
    input.firstHeartbeatAt && input.lastHeartbeatAt
      ? `between ${day(input.firstHeartbeatAt * 1000)} and ${day(input.lastHeartbeatAt * 1000)}`
      : null;

  const hackatime = section("HACKATIME", [
    `Projects: ${input.hackatimeProjects.join(", ") || "none"}.`,
    `${hours(input.trackedSeconds)} tracked${span ? ` ${span}` : ""}, in ${input.sessions} coding session${input.sessions === 1 ? "" : "s"} (longest ${input.longestSessionHours}h).`,
    input.writeRatio !== null ? `${input.writeRatio}% of heartbeats were writes, not just reading.` : null,
    input.doubleDipMinutes > 0
      ? `${input.doubleDipMinutes} min overlap with other Hackatime projects, deducted from the approval.`
      : "No overlap with other Hackatime projects.",
  ]);

  const repo = input.repo;
  const code = section("CODE", [
    repo ? `Repository ${repo.htmlUrl}${repo.fork ? ` (fork of ${repo.parent ?? "another repository"})` : ""}.` : "No public repository could be read.",
    repo?.commitCount !== null && repo?.commitCount !== undefined
      ? `${repo.commitCount} commit${repo.commitCount === 1 ? "" : "s"}${repo.firstCommit?.date ? `, first on ${day(Date.parse(repo.firstCommit.date))}` : ""}${repo.recent[0]?.date ? `, latest on ${day(Date.parse(repo.recent[0].date))}` : ""}.`
      : null,
    repo && repo.authors.length > 0 ? `Recent commit authors: ${repo.authors.join(", ")}.` : null,
    repo ? `Commit history: ${repo.htmlUrl}/commits` : null,
  ]);

  const ai = input.ai;
  const authenticity = section("AUTHENTICITY", [
    ai
      ? ai.basis === "lines"
        ? `Hackatime counts ${ai.aiLines} AI-written lines against ${ai.humanLines} written by hand (${ai.percentage}% AI).`
        : `${ai.percentage}% of heartbeats show AI involvement (the editor does not report line counts).`
      : null,
    input.idleMinutes > 0 ? `${input.idleMinutes} min of idle editor activity found.` : "No idle editor activity (no auto key presser pattern).",
    input.pasteBursts > 0 ? `${input.pasteBursts} likely paste bursts reviewed.` : "No paste bursts.",
  ]);

  const shipsElsewhere = (input.priorShips ?? []).filter((ship) => ship.match === "same-repo");
  const others = section("OTHER YSWS PROGRAMS", [
    input.priorShips === null
      ? "The unified YSWS database could not be checked at review time."
      : shipsElsewhere.length === 0
        ? "This repository has not been approved by any other YSWS program."
        : `This repository was already approved by ${shipsElsewhere
            .map((ship) => `${ship.ysws} (${ship.hours ?? "?"}h)`)
            .join(", ")}; only work after that approval is counted.`,
  ]);

  const demo = input.demo
    ? section("DEMO", [input.demo.ok ? `${input.demo.url} loads.` : `${input.demo.url}: ${input.demo.problem ?? "not working"}`])
    : null;

  const concerns = section(
    "REVIEWER NOTES",
    input.flags.map((flag) => flag.text),
  );

  return [hackatime, code, authenticity, others, demo, concerns].filter(Boolean).join("\n\n");
}

/** The decision line goes on top at the moment of approval, when the hours are final. */
export function withDecision(body: string, approvedHours: number, trackedSeconds: number): string {
  const cut = trackedSeconds / 3600 - approvedHours;
  const head =
    cut > 0.05
      ? `Approved ${approvedHours}h of ${hours(trackedSeconds)} tracked. ${Math.round(cut * 10) / 10}h deducted after review; reasons below.`
      : `Approved ${approvedHours}h of ${hours(trackedSeconds)} tracked.`;
  return `${head}\n\n${body}`.trim();
}
