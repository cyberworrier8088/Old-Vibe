import type { SessionCluster } from "@/lib/hackatime/projects";
import type { CommitDetail, RepoForensicData, TreeFile } from "@/lib/superviewer/repo";

import type { Flag } from "./evidence";

/**
 * Pure: the checks a fraud reviewer does by hand, done from GitHub and Hackatime data together.
 *
 * - Are the tracked hours backed by commits? Reviewers deflate hours that no commit follows.
 * - Did Hackatime see the repository's files being written, or did the code arrive some other way?
 * - Were commits made while nothing was being tracked?
 * - Do commits or files show an AI agent at work?
 * - Was the history rewritten or split up so the dates cannot be trusted?
 * - Is there more code than the tracked time could plausibly produce?
 */

export type CheckTone = "ok" | "warn" | "bad" | "unknown";

export type ForensicCheck = {
  key: string;
  label: string;
  /** The headline figure, for example "6.5h of 9h". */
  value: string;
  detail: string;
  tone: CheckTone;
  items?: { text: string; href?: string }[];
};

export type Forensics = {
  checks: ForensicCheck[];
  flags: Flag[];
  /** Share of the tracked time that commits back up, 0 to 1. Null when it cannot be judged. */
  commitBackedShare: number | null;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** A commit this long after a session still counts as that session's commit. */
const COMMIT_GRACE_MS = 2 * HOUR_MS;
/** A commit with no tracked activity this long before it was made away from Hackatime. */
const LOOKBACK_MS = 3 * HOUR_MS;
/** Average bytes in a line of code, to turn file sizes into rough line counts. */
const BYTES_PER_LINE = 32;
/** Bigger than this, a file is generated or bundled rather than written. */
const MAX_HANDWRITTEN_BYTES = 300_000;

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const SOURCE_EXTENSIONS = new Set(
  (
    "ts tsx js jsx mjs cjs py rs go java kt kts c h cpp cc cxx hpp hh cs swift m mm rb php lua gd " +
    "gdshader dart vue svelte astro html htm css scss sass less sh bash ps1 zig nim hs ml ex exs erl " +
    "clj scala r jl sql glsl wgsl hlsl shader asm s v sv vhd vhdl ino pde elm fs odin hx cr pl rkt " +
    "lisp scm f90 nix"
  ).split(" "),
);
const SKIPPED_DIRS =
  /(^|\/)(node_modules|bower_components|vendor|vendors|third[_-]?party|dist|build|out|target|\.next|\.nuxt|\.svelte-kit|\.output|coverage|__pycache__|\.venv|venv|site-packages|\.godot|\.import)(\/|$)/i;
const SKIPPED_FILES = /\.min\.(js|css)$|\.bundle\.js$|\.d\.ts$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

const AI_FILES: { test: RegExp; label: string }[] = [
  { test: /(^|\/)claude\.md$/i, label: "CLAUDE.md (Claude Code)" },
  { test: /(^|\/)\.claude\//i, label: ".claude/ (Claude Code)" },
  { test: /(^|\/)agents\.md$/i, label: "AGENTS.md (coding agents)" },
  { test: /(^|\/)gemini\.md$|(^|\/)\.gemini\//i, label: "Gemini CLI" },
  { test: /(^|\/)\.cursorrules$|(^|\/)\.cursor\//i, label: "Cursor rules" },
  { test: /(^|\/)\.windsurfrules$|(^|\/)\.windsurf\//i, label: "Windsurf rules" },
  { test: /(^|\/)\.clinerules/i, label: "Cline rules" },
  { test: /(^|\/)\.roomodes$|(^|\/)\.roo\//i, label: "Roo Code" },
  { test: /(^|\/)\.kiro\//i, label: "Kiro" },
  { test: /(^|\/)copilot-instructions\.md$|(^|\/)\.github\/(prompts|instructions|agents)\//i, label: "Copilot instructions" },
  { test: /(^|\/)\.aider/i, label: "aider" },
  { test: /(^|\/)\.specstory\//i, label: ".specstory/ (saved AI chats)" },
  { test: /(^|\/)\.continue\//i, label: "Continue" },
  { test: /(^|\/)\.codex\//i, label: "Codex" },
  { test: /(^|\/)\.goosehints$/i, label: "Goose" },
  { test: /(^|\/)\.junie\//i, label: "JetBrains Junie" },
  { test: /(^|\/)\.trae\//i, label: "Trae" },
];

const AI_COMMITS: { test: RegExp; label: string }[] = [
  { test: /co-authored-by:[^\n]*(claude|anthropic)/i, label: "Co-Authored-By Claude" },
  { test: /generated with \[?claude code/i, label: "Generated with Claude Code" },
  { test: /co-authored-by:[^\n]*copilot/i, label: "Co-authored by Copilot" },
  { test: /co-authored-by:[^\n]*cursor/i, label: "Co-authored by Cursor" },
  { test: /co-authored-by:[^\n]*(openai|codex|chatgpt)/i, label: "Co-authored by Codex" },
  { test: /co-authored-by:[^\n]*(gemini|jules|google-labs)/i, label: "Co-authored by Gemini" },
  { test: /co-authored-by:[^\n]*(devin|windsurf|codeium|aider|cline|kiro|factory)/i, label: "Co-authored by an AI agent" },
  { test: /^aider: /i, label: "Made by aider" },
  { test: /generated (by|with|using) (ai|chatgpt|copilot|cursor|gemini|claude)/i, label: "Says it was AI-generated" },
];
const AI_ACCOUNTS =
  /^(copilot|copilot-swe-agent\[bot\]|devin-ai-integration\[bot\]|google-labs-jules\[bot\]|cursoragent|cursor\[bot\]|claude\[bot\]|codex\[bot\]|chatgpt-codex-connector\[bot\])$/i;

const toMs = (iso: string | null) => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : null;
};
const commitTime = (commit: CommitDetail) => toMs(commit.authorDate) ?? toMs(commit.committerDate);
const firstLine = (message: string) => message.split(/\r?\n/, 1)[0].slice(0, 90);
const roundHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function isSource(file: TreeFile): boolean {
  if (SKIPPED_DIRS.test(file.path) || SKIPPED_FILES.test(file.path)) return false;
  if (file.size > MAX_HANDWRITTEN_BYTES) return false;
  const name = file.path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && SOURCE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Every trailing part of every edited path, so "src/a.ts" in the repo matches "C:/me/app/src/a.ts". */
function editedSuffixes(entities: string[]): Set<string> {
  const suffixes = new Set<string>();
  for (const entity of entities) {
    const parts = entity.replace(/\\/g, "/").toLowerCase().split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) suffixes.add(parts.slice(i).join("/"));
  }
  return suffixes;
}

function commitBacking(
  commits: CommitDetail[],
  complete: boolean,
  sessions: SessionCluster[],
): { check: ForensicCheck; share: number | null } {
  const times = commits
    .map(commitTime)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);
  // With only the latest hundred commits, sessions older than the oldest of them cannot be judged.
  const judgedFrom = complete || times.length === 0 ? -Infinity : times[0];

  let totalMinutes = 0;
  let judgedMinutes = 0;
  let backedMinutes = 0;
  const unbacked: SessionCluster[] = [];
  for (const session of sessions) {
    totalMinutes += session.durationMinutes;
    if (session.endTime * 1000 < judgedFrom) continue;
    judgedMinutes += session.durationMinutes;
    const start = session.startTime * 1000;
    const end = session.endTime * 1000 + COMMIT_GRACE_MS;
    if (times.some((t) => t >= start && t <= end)) backedMinutes += session.durationMinutes;
    else unbacked.push(session);
  }

  if (totalMinutes === 0) {
    return {
      share: null,
      check: {
        key: "commits",
        label: "Hours backed by commits",
        value: "no sessions",
        detail: "Hackatime has no coding sessions on the claimed projects since the start.",
        tone: "unknown",
      },
    };
  }

  // Sessions too old to judge get the benefit of the doubt.
  const share = (backedMinutes + (totalMinutes - judgedMinutes)) / totalMinutes;
  const judgedShare = judgedMinutes > 0 ? backedMinutes / judgedMinutes : 1;
  const tone: CheckTone = judgedMinutes < 60 || judgedShare >= 0.7 ? "ok" : "warn";
  return {
    share,
    check: {
      key: "commits",
      label: "Hours backed by commits",
      value: `${roundHours(backedMinutes)}h of ${roundHours(judgedMinutes)}h`,
      detail: [
        unbacked.length === 0
          ? "Every coding session was followed by a commit within two hours."
          : `${plural(unbacked.length, "session")} had no commit within two hours. Reviewers usually deflate hours that no commit backs up.`,
        judgedMinutes < totalMinutes
          ? `${roundHours(totalMinutes - judgedMinutes)}h from before the latest hundred commits could not be checked and counts as backed.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      tone,
      items: unbacked
        .sort((a, b) => b.durationMinutes - a.durationMinutes)
        .slice(0, 5)
        .map((session) => ({
          text: `${WHEN.format(session.startTime * 1000)} UTC, ${roundHours(session.durationMinutes)}h with no commit after it`,
        })),
    },
  };
}

function untrackedCommits(commits: CommitDetail[], sessions: SessionCluster[], start: number): ForensicCheck {
  const relevant = commits.filter((commit) => {
    const at = commitTime(commit);
    // Merges and browser edits never have editor activity behind them.
    return at !== null && at >= start && !commit.viaWeb && !/^merge /i.test(commit.message);
  });
  const away = relevant.filter((commit) => {
    const at = commitTime(commit) as number;
    return !sessions.some(
      (session) => session.startTime * 1000 <= at + 10 * 60_000 && session.endTime * 1000 >= at - LOOKBACK_MS,
    );
  });
  const share = relevant.length > 0 ? away.length / relevant.length : 0;
  return {
    key: "untracked-commits",
    label: "Commits with nothing tracked",
    value: `${away.length} of ${relevant.length}`,
    detail:
      away.length === 0
        ? "Every commit since the start came while Hackatime was tracking the claimed projects."
        : "Commits made with no Hackatime activity in the three hours before: that code was written untracked, on another machine, or by someone else.",
    tone: away.length >= 3 && share >= 0.3 ? "warn" : "ok",
    items: away.slice(0, 5).map((commit) => ({
      text: `${WHEN.format(commitTime(commit) as number)} UTC  ${firstLine(commit.message)}`,
      href: commit.url,
    })),
  };
}

function aiCommits(commits: CommitDetail[]): ForensicCheck {
  const found: { commit: CommitDetail; reason: string }[] = [];
  for (const commit of commits) {
    const rule = AI_COMMITS.find((r) => r.test.test(commit.message));
    if (rule) found.push({ commit, reason: rule.label });
    else if (commit.authorLogin && AI_ACCOUNTS.test(commit.authorLogin)) {
      found.push({ commit, reason: `Made by ${commit.authorLogin}` });
    }
  }
  return {
    key: "ai-commits",
    label: "AI-written commits",
    value: found.length === 0 ? "none" : `${found.length} of ${commits.length}`,
    detail:
      found.length === 0
        ? "No commit says it was written by an AI tool."
        : "These commits name an AI tool as author or co-author. Old-Vibe does not pay for AI-written code.",
    tone: found.length > 0 ? "bad" : "ok",
    items: found.slice(0, 5).map(({ commit, reason }) => ({
      text: `${reason}: ${firstLine(commit.message)}`,
      href: commit.url,
    })),
  };
}

function aiFiles(tree: TreeFile[]): ForensicCheck {
  const found = new Map<string, string>();
  for (const file of tree) {
    const rule = AI_FILES.find((r) => r.test.test(file.path));
    if (rule && !found.has(rule.label)) found.set(rule.label, file.path);
  }
  return {
    key: "ai-files",
    label: "AI agent files",
    value: found.size === 0 ? "none" : plural(found.size, "tool"),
    detail:
      found.size === 0
        ? "No instruction files for coding agents in the repository."
        : "Instruction files for coding agents. An agent was set up to work on this code; check the commits for agent-written changes.",
    tone: found.size > 0 ? "warn" : "ok",
    items: [...found].map(([label, path]) => ({ text: `${label}: ${path}` })),
  };
}

function history(commits: CommitDetail[]): ForensicCheck {
  const dated = commits
    .map((commit) => ({ commit, committed: toMs(commit.committerDate), authored: toMs(commit.authorDate) }))
    .filter((c): c is { commit: CommitDetail; committed: number; authored: number } =>
      c.committed !== null && c.authored !== null,
    )
    .sort((a, b) => a.committed - b.committed);

  // Many commits written over days but all committed within two minutes: a rebase or a script.
  let rewrite: { count: number; spanDays: number; at: number } | null = null;
  for (let i = 0; i < dated.length; ) {
    let j = i;
    while (j + 1 < dated.length && dated[j + 1].committed - dated[i].committed <= 120_000) j++;
    const group = dated.slice(i, j + 1);
    if (group.length >= 5) {
      const authored = group.map((c) => c.authored);
      const span = Math.max(...authored) - Math.min(...authored);
      if (span > DAY_MS && (!rewrite || group.length > rewrite.count)) {
        rewrite = { count: group.length, spanDays: Math.round(span / DAY_MS), at: dated[i].committed };
      }
    }
    i = j + 1;
  }

  // Most commits seconds apart: one change split up afterwards, or commits made to look steady.
  const authored = dated.map((c) => c.authored).sort((a, b) => a - b);
  let bursts = 0;
  for (let i = 1; i < authored.length; i++) if (authored[i] - authored[i - 1] <= 60_000) bursts++;
  const bursty = authored.length >= 10 && bursts / authored.length >= 0.5;

  const items: { text: string }[] = [];
  if (rewrite) {
    items.push({
      text: `${rewrite.count} commits written over ${plural(rewrite.spanDays, "day")} were all committed within two minutes on ${DAY.format(rewrite.at)}`,
    });
  }
  if (bursty) items.push({ text: `${bursts} of ${authored.length} commits came less than a minute after the one before` });

  return {
    key: "history",
    label: "Commit history",
    value: items.length === 0 ? "looks natural" : "rewritten",
    detail:
      items.length === 0
        ? "Commit times are spread out the way real work is."
        : "The history was rewritten or split up, so commit dates do not prove when the work happened. Lean on Hackatime instead.",
    tone: items.length > 0 ? "warn" : dated.length === 0 ? "unknown" : "ok",
    items,
  };
}

export function analyseForensics(input: {
  data: RepoForensicData | null;
  /** Every distinct file Hackatime saw edited on the claimed projects since the start. */
  entityPaths: string[];
  sessions: SessionCluster[];
  trackedSeconds: number;
  eventStart: string;
}): Forensics {
  const { data, sessions } = input;
  const start = Date.parse(`${input.eventStart}T00:00:00Z`);
  const checks: ForensicCheck[] = [];
  let commitBackedShare: number | null = null;

  if (!data) {
    return {
      checks: [
        {
          key: "repository",
          label: "Repository",
          value: "not readable",
          detail: "No public GitHub repository could be read, so commits and files were not checked.",
          tone: "unknown",
        },
      ],
      flags: [],
      commitBackedShare: null,
    };
  }

  const complete = data.commitCount === null || data.commits.length >= data.commitCount;
  const backing = commitBacking(data.commits, complete, sessions);
  commitBackedShare = backing.share;
  checks.push(backing.check);

  const source = data.tree?.filter(isSource) ?? [];
  const sourceBytes = source.reduce((sum, file) => sum + file.size, 0);
  const pathsKnown = input.entityPaths.some((entity) => /[\\/]/.test(entity));
  if (data.tree && source.length > 0) {
    if (pathsKnown) {
      const edited = editedSuffixes(input.entityPaths);
      const seen = source.filter((file) => edited.has(file.path.toLowerCase()));
      const seenBytes = seen.reduce((sum, file) => sum + file.size, 0);
      const percent = sourceBytes > 0 ? Math.round((seenBytes / sourceBytes) * 100) : 100;
      const unseen = source.filter((file) => !edited.has(file.path.toLowerCase()));
      const meaningful = sourceBytes >= 3000;
      checks.push({
        key: "coverage",
        label: "Code Hackatime saw being written",
        value: `${percent}%`,
        detail: `${seen.length} of ${plural(source.length, "source file")} were edited while Hackatime tracked the claimed projects since the start. ${
          percent < 70 ? "The rest was written before, somewhere else, pasted in or generated." : ""
        }`.trim(),
        tone: !meaningful || percent >= 70 ? "ok" : percent >= 40 ? "warn" : "bad",
        items: unseen
          .sort((a, b) => b.size - a.size)
          .slice(0, 6)
          .map((file) => ({ text: `${file.path} (${Math.max(1, Math.round(file.size / 1024))} KB, never edited while tracked)` })),
      });
    } else {
      checks.push({
        key: "coverage",
        label: "Code Hackatime saw being written",
        value: "unknown",
        detail: "Hackatime did not report file paths for these heartbeats, so files could not be matched.",
        tone: "unknown",
      });
    }
  }

  checks.push(untrackedCommits(data.commits, sessions, start));
  checks.push(aiCommits(data.commits));
  if (data.tree) checks.push(aiFiles(data.tree));
  checks.push(history(data.commits));

  if (data.tree && sourceBytes > 0) {
    const lines = Math.round(sourceBytes / BYTES_PER_LINE);
    const trackedHours = input.trackedSeconds / 3600;
    const perHour = trackedHours > 0 ? Math.round(lines / trackedHours) : null;
    const tooMuch = perHour !== null && trackedHours >= 0.5 && lines >= 1500 && perHour > 400;
    checks.push({
      key: "volume",
      label: "Code for the time",
      value: `~${lines.toLocaleString("en-GB")} lines`,
      detail:
        perHour === null
          ? "No tracked time to compare the code with."
          : `About ${perHour.toLocaleString("en-GB")} lines for each tracked hour.${
              tooMuch ? " Hand-written code rarely goes past a couple of hundred lines an hour; check where the rest came from." : ""
            }`,
      tone: tooMuch ? "warn" : "ok",
    });
  }

  const flags: Flag[] = checks
    .filter((check) => check.tone === "warn" || check.tone === "bad")
    .map((check): Flag => ({ tone: check.tone === "bad" ? "bad" : "warn", text: `${check.label}: ${check.value}. ${check.detail}` }));

  return { checks, flags, commitBackedShare };
}
