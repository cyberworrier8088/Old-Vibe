import { fetchRepoFacts } from "@/lib/superviewer/repo";
import type { RepoFacts } from "@/lib/superviewer/repo";

import { checkDemo } from "./demo";
import type { DemoCheck } from "./demo";
import { findPriorShips } from "./unified";
import type { PriorShip } from "./unified";

export type { DemoCheck, PriorShip, RepoFacts };

/** What the outside world says about a submission: GitHub, other YSWS programs, the demo link. */
export type Evidence = {
  repo: RepoFacts | null;
  /** Null when the unified YSWS database could not be reached. */
  priorShips: PriorShip[] | null;
  demo: DemoCheck | null;
};

/** Starts every lookup at once. Never rejects: each part that fails comes back null. */
export async function gatherEvidence(input: {
  repoUrl: string | null;
  demoUrl: string | null;
  githubUsername: string | null;
  slackId: string | null;
}): Promise<Evidence> {
  const repo = input.repoUrl ? fetchRepoFacts(input.repoUrl) : Promise.resolve(null);
  const demo = checkDemo(input.demoUrl);
  // The repo owner is a good stand-in when Hackatime does not know the maker's GitHub name.
  const githubUsername =
    input.githubUsername ?? (await repo)?.slug.split("/")[0] ?? null;

  const [repoFacts, priorShips, demoCheck] = await Promise.all([
    repo,
    findPriorShips({ repoUrl: input.repoUrl, githubUsername, slackId: input.slackId }),
    demo,
  ]);
  return { repo: repoFacts, priorShips, demo: demoCheck };
}

export type Tone = "neutral" | "warn" | "bad";

export type TimelineEvent = {
  /** Epoch milliseconds. */
  at: number;
  label: string;
  detail?: string;
  tone: Tone;
  href?: string;
};

export type Flag = { tone: Exclude<Tone, "neutral">; text: string };

const DAY_MS = 86_400_000;
const toMs = (iso: string | null | undefined) => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : null;
};

/**
 * Pure: puts every timestamp we know about a submission in one order, and says which ones are
 * out of place. Shared by the review page, so it never disagrees with itself.
 */
export function buildTimeline(input: {
  evidence: Evidence;
  eventStart: string;
  submittedAt: string | null;
  firstHeartbeatAt: number | null;
  lastHeartbeatAt: number | null;
  makerGithub: string | null;
}): { events: TimelineEvent[]; flags: Flag[] } {
  const { repo, priorShips, demo } = input.evidence;
  const events: TimelineEvent[] = [];
  const flags: Flag[] = [];
  const start = Date.parse(`${input.eventStart}T00:00:00Z`);

  events.push({ at: start, label: "Old-Vibe started", tone: "neutral" });

  const created = toMs(repo?.createdAt);
  if (created !== null) {
    const early = created < start - DAY_MS;
    events.push({
      at: created,
      label: "Repository created",
      tone: early ? "warn" : "neutral",
      href: repo?.htmlUrl,
    });
  }

  const firstCommit = toMs(repo?.firstCommit?.date);
  if (firstCommit !== null && repo?.firstCommit) {
    const early = firstCommit < start - DAY_MS;
    events.push({
      at: firstCommit,
      label: "First commit",
      detail: `${repo.firstCommit.message} (${repo.firstCommit.author})`,
      tone: early ? "warn" : "neutral",
      href: repo.firstCommit.url,
    });
    if (early) {
      const days = Math.round((start - firstCommit) / DAY_MS);
      flags.push({
        tone: "warn",
        text: `The first commit is ${days} days before Old-Vibe started. Some code may predate the event; only hours since the start count.`,
      });
    }
  }

  if (input.firstHeartbeatAt) {
    events.push({ at: input.firstHeartbeatAt * 1000, label: "First Hackatime heartbeat", tone: "neutral" });
  }
  if (input.lastHeartbeatAt) {
    events.push({ at: input.lastHeartbeatAt * 1000, label: "Last Hackatime heartbeat", tone: "neutral" });
  }

  const lastCommit = toMs(repo?.recent[0]?.date);
  if (lastCommit !== null && repo?.recent[0]) {
    events.push({
      at: lastCommit,
      label: "Latest commit",
      detail: `${repo.recent[0].message} (${repo.recent[0].author})`,
      tone: "neutral",
      href: repo.recent[0].url,
    });
  }

  const submitted = toMs(input.submittedAt);
  if (submitted !== null) events.push({ at: submitted, label: "Submitted to Old-Vibe", tone: "neutral" });

  for (const ship of priorShips ?? []) {
    if (!ship.approvedAt) continue;
    const sameRepo = ship.match === "same-repo";
    events.push({
      at: ship.approvedAt * 1000,
      label: `Approved by ${ship.ysws}`,
      detail: `${ship.hours ?? "?"}h · ${ship.codeUrl}${sameRepo ? " · this repository" : ""}`,
      tone: sameRepo ? "bad" : ship.match === "same-name" ? "warn" : "neutral",
      href: ship.codeUrl,
    });
  }

  for (const ship of (priorShips ?? []).filter((s) => s.match === "same-repo")) {
    flags.push({
      tone: "bad",
      text: `This repository was already approved by ${ship.ysws}${ship.hours !== null ? ` for ${ship.hours}h` : ""}. The same work cannot be paid twice; only new hours count.`,
    });
  }
  const copies = (priorShips ?? []).filter((s) => s.match === "same-name");
  if (copies.length > 0) {
    flags.push({
      tone: "warn",
      text: `A repository with the same name was shipped by someone else (${copies
        .slice(0, 2)
        .map((s) => `@${s.githubUsername ?? "unknown"} to ${s.ysws}`)
        .join(", ")}). Check it is not a copy.`,
    });
  }

  if (repo?.fork) {
    flags.push({
      tone: "warn",
      text: repo.parent
        ? `This is a fork of ${repo.parent}. Only the maker's own changes count.`
        : "This repository is a fork. Only the maker's own changes count.",
    });
  }
  if (repo && repo.commitCount !== null && repo.commitCount <= 2) {
    flags.push({
      tone: "warn",
      text: `Only ${repo.commitCount} commit${repo.commitCount === 1 ? "" : "s"}. Real work usually shows many small steps.`,
    });
  }
  const maker = input.makerGithub ? `@${input.makerGithub.toLowerCase()}` : null;
  const others = maker ? (repo?.authors ?? []).filter((a) => a.toLowerCase() !== maker) : [];
  if (maker && others.length > 0) {
    flags.push({
      tone: "warn",
      text: `Recent commits also come from ${others.slice(0, 3).join(", ")}. Make sure the maker did the work they claim.`,
    });
  }
  if (demo && !demo.ok) {
    flags.push({ tone: "bad", text: `The demo link does not work. ${demo.problem ?? ""}`.trim() });
  }

  events.sort((a, b) => a.at - b.at);
  return { events, flags };
}
