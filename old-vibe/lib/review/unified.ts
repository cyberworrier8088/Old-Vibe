import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Hack Club's Unified YSWS database: every project any YSWS program has approved, published at
 * ships.hackclub.com. Matching a submission against it shows whether the same repository, or the
 * same maker, was already paid by another program, when, and for how many hours.
 *
 * The API always sends every entry (about 3MB, no filtering) and is often slow: from ten seconds to
 * several minutes when it is busy. So a review never waits for it: lookups use the last good copy,
 * from memory or from a file that survives restarts, and a fresh copy is fetched in the background
 * once that one is half an hour old. With no copy at all, a lookup waits a few seconds at most.
 */

const SOURCE = "https://ships.hackclub.com/api/v1/ysws_entries";
/** After this, the next lookup refreshes the copy in the background. */
const FRESH_MS = 30 * 60_000;
/** After a failed fetch, wait this long before trying again. */
const RETRY_MS = 2 * 60_000;
/** A background download may take this long; the API can trickle out the file slowly. */
const DOWNLOAD_MS = 10 * 60_000;
/** With no copy yet, a lookup waits this long for the download before giving up for now. */
const FIRST_WAIT_MS = 4_000;
const DISK_COPY = join(tmpdir(), "old-vibe-ysws-entries.json");

export type UnifiedShip = {
  ysws: string;
  /** Epoch seconds, as the API gives it. */
  approvedAt: number | null;
  codeUrl: string;
  demoUrl: string | null;
  hours: number | null;
  githubUsername: string | null;
  slackId: string | null;
};

export type PriorShip = UnifiedShip & { match: "same-repo" | "same-maker" | "same-name" };

type Index = {
  byRepo: Map<string, UnifiedShip[]>;
  byName: Map<string, UnifiedShip[]>;
  byGithub: Map<string, UnifiedShip[]>;
  bySlack: Map<string, UnifiedShip[]>;
  size: number;
};

/** The API writes missing values as the string "null". */
const clean = (value: unknown): string | null =>
  typeof value === "string" && value.trim() && value !== "null" ? value.trim() : null;

/** owner/repo for GitHub links, otherwise the bare host and path, all lower case. */
export function repoKey(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (/(^|\.)github\.com$/i.test(parsed.hostname)) {
      return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`.toLowerCase() : null;
    }
    return `${parsed.hostname}/${parts.join("/")}`.replace(/\.git$/i, "").toLowerCase();
  } catch {
    return null;
  }
}

const repoName = (key: string) => key.split("/").pop() ?? key;

/** Repository names too common to mean anything when two strangers share them. */
const GENERIC_NAMES = new Set([
  "portfolio",
  "website",
  "my-website",
  "personal-website",
  "blog",
  "game",
  "app",
  "test",
  "project",
  "todo",
  "todo-app",
  "calculator",
  "weather-app",
  "chatbot",
  "discord-bot",
  "bot",
  "keyboard",
  "macropad",
  "hackpad",
]);

function push(map: Map<string, UnifiedShip[]>, key: string | null, ship: UnifiedShip) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(ship);
  else map.set(key, [ship]);
}

export function buildIndex(raw: unknown[]): Index {
  const index: Index = { byRepo: new Map(), byName: new Map(), byGithub: new Map(), bySlack: new Map(), size: 0 };
  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const codeUrl = clean(e.code_url);
    if (!codeUrl) continue;
    const ship: UnifiedShip = {
      ysws: clean(e.ysws) ?? "Unknown program",
      approvedAt: typeof e.approved_at === "number" ? e.approved_at : null,
      codeUrl,
      demoUrl: clean(e.demo_url),
      hours: typeof e.hours === "number" ? e.hours : null,
      githubUsername: clean(e.github_username),
      slackId: clean(e.slack_id),
    };
    const key = repoKey(codeUrl);
    push(index.byRepo, key, ship);
    if (key) push(index.byName, repoName(key), ship);
    push(index.byGithub, ship.githubUsername?.toLowerCase() ?? null, ship);
    push(index.bySlack, ship.slackId?.toUpperCase() ?? null, ship);
    index.size++;
  }
  return index;
}

type Copy = { fetchedAt: number; etag: string | null; entries: unknown[] };

const state: {
  index: Index | null;
  fetchedAt: number;
  etag: string | null;
  failedAt: number;
  refreshing: Promise<Index | null> | null;
  fromDisk: Promise<void> | null;
} = { index: null, fetchedAt: 0, etag: null, failedAt: 0, refreshing: null, fromDisk: null };

/** Only the fields the index uses, so the copy on disk stays small. */
const slim = (entry: Record<string, unknown>) => ({
  ysws: entry.ysws,
  approved_at: entry.approved_at,
  code_url: entry.code_url,
  demo_url: entry.demo_url,
  hours: entry.hours,
  github_username: entry.github_username,
  slack_id: entry.slack_id,
});

function adopt(copy: Copy) {
  state.index = buildIndex(copy.entries);
  state.fetchedAt = copy.fetchedAt;
  state.etag = copy.etag;
}

async function readDiskCopy() {
  try {
    const copy = JSON.parse(await readFile(DISK_COPY, "utf8")) as Copy;
    if (!state.index && Array.isArray(copy.entries)) adopt(copy);
  } catch {
    // No copy yet, or an unreadable one: the network fetch will replace it.
  }
}

/** Fetches a fresh copy, or confirms the current one with the ETag. Never rejects. */
function refresh(): Promise<Index | null> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const headers: Record<string, string> = {};
      if (state.etag && state.index) headers["If-None-Match"] = state.etag;
      const response = await fetch(SOURCE, { headers, cache: "no-store", signal: AbortSignal.timeout(DOWNLOAD_MS) });
      if (response.status === 304) {
        state.fetchedAt = Date.now();
        return state.index;
      }
      if (!response.ok) throw new Error(`ysws entries returned ${response.status}`);
      const raw = (await response.json()) as unknown;
      if (!Array.isArray(raw)) throw new Error("ysws entries were not a list");
      const copy: Copy = {
        fetchedAt: Date.now(),
        etag: response.headers.get("etag"),
        entries: raw.map((entry) => slim(entry as Record<string, unknown>)),
      };
      adopt(copy);
      writeFile(DISK_COPY, JSON.stringify(copy)).catch(() => {});
      return state.index;
    } catch (error) {
      state.failedAt = Date.now();
      console.warn("[unified] ysws entries fetch failed:", (error as Error).message);
      return state.index;
    } finally {
      state.refreshing = null;
    }
  })();
  return state.refreshing;
}

/**
 * The index to match against, without waiting on the network when any copy exists. With none, the
 * download starts and the lookup waits a few seconds; if it is not done, the page says to reload
 * while the download carries on in the background.
 */
async function loadIndex(): Promise<Index | null> {
  if (!state.index) {
    state.fromDisk ??= readDiskCopy();
    await state.fromDisk;
  }
  const stale = Date.now() - state.fetchedAt > FRESH_MS;
  const mayRetry = Date.now() - state.failedAt > RETRY_MS;
  if (state.index) {
    if (stale && mayRetry) void refresh();
    return state.index;
  }
  const download = state.refreshing ?? (mayRetry ? refresh() : null);
  if (!download) return null;
  return Promise.race([download, new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_WAIT_MS))]);
}

/** Starts loading the index early, for example when the review queue opens. */
export function warmUnifiedIndex() {
  void loadIndex();
}

/** Pure: what the index says about one submission. */
export function priorShipsFrom(
  index: Index,
  input: { repoUrl: string | null; githubUsername: string | null; slackId: string | null },
): PriorShip[] {
  const out: PriorShip[] = [];
  const seen = new Set<UnifiedShip>();
  const add = (ships: UnifiedShip[] | undefined, match: PriorShip["match"], limit = 20) => {
    for (const ship of (ships ?? []).slice(0, limit)) {
      if (seen.has(ship)) continue;
      seen.add(ship);
      out.push({ ...ship, match });
    }
  };

  const key = input.repoUrl ? repoKey(input.repoUrl) : null;
  add(key ? index.byRepo.get(key) : undefined, "same-repo");

  add(input.githubUsername ? index.byGithub.get(input.githubUsername.toLowerCase()) : undefined, "same-maker");
  add(input.slackId ? index.bySlack.get(input.slackId.toUpperCase()) : undefined, "same-maker");

  // Someone else shipping a repo with the same distinctive name can be a copy.
  if (key) {
    const name = repoName(key);
    if (name.length >= 5 && !GENERIC_NAMES.has(name)) add(index.byName.get(name), "same-name", 5);
  }

  const order = { "same-repo": 0, "same-name": 1, "same-maker": 2 } as const;
  return out.sort((a, b) => order[a.match] - order[b.match] || (b.approvedAt ?? 0) - (a.approvedAt ?? 0));
}

/** Never rejects. Null when the unified database could not be reached. */
export async function findPriorShips(input: {
  repoUrl: string | null;
  githubUsername: string | null;
  slackId: string | null;
}): Promise<PriorShip[] | null> {
  const index = await loadIndex();
  return index ? priorShipsFrom(index, input) : null;
}
