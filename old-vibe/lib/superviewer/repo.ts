const TIMEOUT_MS = 5000;

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
