const TIMEOUT_MS = 5000;

export type RepoCommitEvidence = {
  sha: string;
  message: string;
  author: string;
  date: string | null;
  url: string;
};

export function githubSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}

export async function repoIsReachable(url: string): Promise<boolean | null> {
  const slug = githubSlug(url);
  const target = slug ? `https://github.com/${slug}` : url;

  try {
    const response = await fetch(target, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 404 || response.status === 410) return false;
    if (response.ok) return true;
    return null;
  } catch {
    return null;
  }
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function repoHasReadme(url: string): Promise<boolean | null> {
  const slug = githubSlug(url);
  if (!slug) return null;

  try {
    const response = await fetch(`https://api.github.com/repos/${slug}/readme`, {
      headers: githubHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 404) return false;
    if (response.ok) return true;

    console.error(`[repo] github readme lookup returned ${response.status} for ${slug}`);
    return null;
  } catch (error) {
    console.error("[repo] github readme lookup failed", error);
    return null;
  }
}

export async function repoCommitCount(url: string, cap = 2): Promise<number | null> {
  const slug = githubSlug(url);
  if (!slug) return null;

  try {
    const response = await fetch(`https://api.github.com/repos/${slug}/commits?per_page=${cap}`, {
      headers: githubHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 404 || response.status === 409) return 0;
    if (!response.ok) {
      console.error(`[repo] github commit lookup returned ${response.status} for ${slug}`);
      return null;
    }

    const commits = (await response.json()) as unknown[];
    return Array.isArray(commits) ? commits.length : null;
  } catch (error) {
    console.error("[repo] github commit lookup failed", error);
    return null;
  }
}

const README_TTL_MS = 5 * 60_000;
const README_MISSING_TTL_MS = 60_000;
const README_CACHE_MAX = 100;

// Reviewers reload a ship many times while deciding, and unauthenticated GitHub API calls are
// limited to 60 an hour per IP. So a README is fetched once per repo and reused for a few minutes,
// and callers that arrive while a fetch is running share it.
const readmes = new Map<string, { at: number; ttl: number; text: string | null }>();
const readmeRequests = new Map<string, Promise<string | null>>();

/** `cacheable` is false for anything that might be a passing failure, so those are retried. */
async function lookupReadme(slug: string): Promise<{ text: string | null; cacheable: boolean }> {
  try {
    const response = await fetch(`https://api.github.com/repos/${slug}/readme`, {
      headers: { ...githubHeaders(), Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) return { text: await response.text(), cacheable: true };
    // 404 means the repo has no README or does not exist, so a second request cannot find one.
    if (response.status === 404) return { text: null, cacheable: true };

    // Rate limited or GitHub misbehaving: raw.githubusercontent.com is limited separately.
    const rawRes = await fetch(`https://raw.githubusercontent.com/${slug}/HEAD/README.md`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (rawRes.ok) return { text: await rawRes.text(), cacheable: true };
    return { text: null, cacheable: false };
  } catch (err) {
    console.warn("[repo] fetch readme content error:", err);
    return { text: null, cacheable: false };
  }
}

export function fetchRepoReadmeContent(url: string): Promise<string | null> {
  const slug = githubSlug(url);
  if (!slug) return Promise.resolve(null);

  const key = slug.toLowerCase();
  const hit = readmes.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return Promise.resolve(hit.text);

  const inFlight = readmeRequests.get(key);
  if (inFlight) return inFlight;

  const request = lookupReadme(slug)
    .then(({ text, cacheable }) => {
      if (cacheable) {
        readmes.delete(key);
        if (readmes.size >= README_CACHE_MAX) {
          const oldest = readmes.keys().next().value;
          if (oldest !== undefined) readmes.delete(oldest);
        }
        readmes.set(key, {
          at: Date.now(),
          ttl: text ? README_TTL_MS : README_MISSING_TTL_MS,
          text,
        });
      }
      return text;
    })
    .finally(() => readmeRequests.delete(key));

  readmeRequests.set(key, request);
  return request;
}

export type RepoFacts = {
  slug: string;
  htmlUrl: string;
  createdAt: string | null;
  pushedAt: string | null;
  fork: boolean;
  /** The repository this one was forked from, if any. */
  parent: string | null;
  stars: number;
  /** Total commits on the default branch, read from GitHub's pagination. Null if unknown. */
  commitCount: number | null;
  firstCommit: RepoCommitEvidence | null;
  recent: RepoCommitEvidence[];
  /** Distinct commit authors among the recent commits. */
  authors: string[];
};

/** One commit with everything the forensic checks read. Kept on the server, never sent to a page. */
export type CommitDetail = {
  sha: string;
  url: string;
  /** The whole message, trailers included. */
  message: string;
  /** "@login" when GitHub knows the account, otherwise the git author name. */
  author: string;
  authorLogin: string | null;
  authorDate: string | null;
  committerDate: string | null;
  /** Made on github.com (an edit in the browser, a merged pull request), not in an editor. */
  viaWeb: boolean;
};

export type TreeFile = { path: string; size: number };

/** What the forensic checks need from GitHub: the latest hundred commits and every file. */
export type RepoForensicData = {
  commits: CommitDetail[];
  /** Total commits on the default branch, when known. */
  commitCount: number | null;
  /** Null when the file tree could not be read. */
  tree: TreeFile[] | null;
  treeTruncated: boolean;
};

type GitHubCommit = {
  sha: string;
  html_url: string;
  author: { login?: string } | null;
  committer?: { login?: string } | null;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
    committer: { date?: string } | null;
  };
};

function toDetail(commit: GitHubCommit): CommitDetail {
  return {
    sha: commit.sha,
    url: commit.html_url,
    message: commit.commit.message,
    author: commit.author?.login
      ? `@${commit.author.login}`
      : (commit.commit.author?.name ?? "Unknown author"),
    authorLogin: commit.author?.login ?? null,
    authorDate: commit.commit.author?.date ?? null,
    committerDate: commit.commit.committer?.date ?? null,
    viaWeb: commit.committer?.login === "web-flow",
  };
}

function toEvidence(commit: GitHubCommit): RepoCommitEvidence {
  return {
    sha: commit.sha,
    message: commit.commit.message.split(/\r?\n/, 1)[0],
    author: commit.author?.login
      ? `@${commit.author.login}`
      : (commit.commit.author?.name ?? "Unknown author"),
    date: commit.commit.author?.date ?? commit.commit.committer?.date ?? null,
    url: commit.html_url,
  };
}

async function github(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

const FACTS_TTL_MS = 10 * 60_000;
type Loaded = { facts: RepoFacts; forensic: RepoForensicData } | null;
const facts = new Map<string, { at: number; value: Promise<Loaded> }>();

/**
 * Everything a reviewer needs from GitHub in five requests: the repo itself (fork? when made?), the
 * commit count (from the Link header of a one-per-page listing), the latest hundred commits, the
 * very first commit, and the whole file tree. Cached for ten minutes per repo. Never rejects.
 */
function loadRepo(url: string): Promise<Loaded> {
  const slug = githubSlug(url);
  if (!slug) return Promise.resolve(null);

  const key = slug.toLowerCase();
  const hit = facts.get(key);
  if (hit && Date.now() - hit.at < FACTS_TTL_MS) return hit.value;

  const value = (async (): Promise<Loaded> => {
    try {
      const [repoRes, countRes, recentRes] = await Promise.all([
        github(`/repos/${slug}`),
        github(`/repos/${slug}/commits?per_page=1`),
        github(`/repos/${slug}/commits?per_page=100`),
      ]);
      if (!repoRes.ok) return null;

      const repo = (await repoRes.json()) as {
        html_url: string;
        created_at?: string;
        pushed_at?: string;
        fork?: boolean;
        parent?: { full_name?: string };
        stargazers_count?: number;
        default_branch?: string;
      };

      // Started now so it overlaps the first-commit lookup below.
      const treeRequest = repo.default_branch
        ? github(`/repos/${slug}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`).catch(
            () => null,
          )
        : null;

      // An empty repository answers 409 to the commit listing.
      const listed = recentRes.ok ? ((await recentRes.json()) as GitHubCommit[]) : [];
      const recent = listed.map(toEvidence);

      let commitCount: number | null = countRes.ok ? recent.length : null;
      let firstCommit: RepoCommitEvidence | null = null;
      const last = countRes.headers.get("link")?.match(/[?&]page=(\d+)>;\s*rel="last"/);
      if (last) {
        commitCount = Number(last[1]);
        const rootRes = await github(`/repos/${slug}/commits?per_page=1&page=${last[1]}`);
        if (rootRes.ok) firstCommit = ((await rootRes.json()) as GitHubCommit[]).map(toEvidence)[0] ?? null;
      } else if (recent.length > 0) {
        firstCommit = recent[recent.length - 1];
      }

      let tree: TreeFile[] | null = null;
      let treeTruncated = false;
      const treeRes = treeRequest ? await treeRequest : null;
      if (treeRes?.ok) {
        const body = (await treeRes.json()) as {
          tree?: Array<{ path?: string; type?: string; size?: number }>;
          truncated?: boolean;
        };
        tree = (body.tree ?? [])
          .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
          .map((entry) => ({ path: entry.path as string, size: entry.size ?? 0 }));
        treeTruncated = body.truncated === true;
      }

      return {
        facts: {
          slug,
          htmlUrl: repo.html_url,
          createdAt: repo.created_at ?? null,
          pushedAt: repo.pushed_at ?? null,
          fork: repo.fork === true,
          parent: repo.parent?.full_name ?? null,
          stars: repo.stargazers_count ?? 0,
          commitCount,
          firstCommit,
          recent: recent.slice(0, 8),
          authors: [...new Set(recent.slice(0, 30).map((commit) => commit.author))],
        },
        forensic: { commits: listed.map(toDetail), commitCount, tree, treeTruncated },
      };
    } catch (error) {
      console.warn("[repo] github facts lookup failed", error);
      return null;
    }
  })();

  facts.set(key, { at: Date.now(), value });
  value.then((result) => {
    if (result === null) facts.delete(key);
  });
  return value;
}

/** The repository facts shown to reviewers. Never rejects. */
export async function fetchRepoFacts(url: string): Promise<RepoFacts | null> {
  return (await loadRepo(url))?.facts ?? null;
}

/** Commits and files for the forensic checks, from the same cached lookup. Never rejects. */
export async function fetchRepoForensicData(url: string): Promise<RepoForensicData | null> {
  return (await loadRepo(url))?.forensic ?? null;
}
