/**
 * Hack Club's Unified YSWS database: every project any YSWS program has approved, published at
 * ships.hackclub.com. Matching a submission against it shows whether the same repository, or the
 * same maker, was already paid by another program, when, and for how many hours.
 *
 * The file is about 9MB, so it is fetched once and indexed in memory for half an hour.
 */

const SOURCE = "https://ships.hackclub.com/api/v1/ysws_entries";
const TTL_MS = 30 * 60_000;

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

let cached: { at: number; index: Promise<Index | null> } | null = null;

function loadIndex(): Promise<Index | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;

  const index = (async () => {
    try {
      const response = await fetch(SOURCE, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        console.warn(`[unified] ysws entries returned ${response.status}`);
        return null;
      }
      const raw = (await response.json()) as unknown;
      return Array.isArray(raw) ? buildIndex(raw) : null;
    } catch (error) {
      console.warn("[unified] ysws entries fetch failed", error);
      return null;
    }
  })();

  cached = { at: Date.now(), index };
  index.then((value) => {
    if (value === null) cached = null;
  });
  return index;
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
