import { BlockedUrlError, safeFetch } from "./safe-fetch";

/**
 * Does the demo link actually work? A "ghost demo" is a link that 404s, or a host's placeholder
 * page for a deployment that is gone.
 */

export type DemoCheck = {
  url: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  problem: string | null;
};

const PARKED = [
  { pattern: /DEPLOYMENT_NOT_FOUND|The deployment could not be found/i, label: "a Vercel deployment that no longer exists" },
  { pattern: /Site not found[\s\S]{0,200}netlify/i, label: "a Netlify site that no longer exists" },
  { pattern: /There isn't a GitHub Pages site here/i, label: "a GitHub Pages address with no site" },
  { pattern: /This domain (is|may be) for sale|domain is parked/i, label: "a parked domain" },
  { pattern: /Application error[\s\S]{0,100}heroku/i, label: "a crashed Heroku app" },
];

/** Reads at most `limit` bytes of a body, so a huge page cannot fill memory. */
async function readCapped(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks)).slice(0, limit);
}

/** Never rejects. */
export async function checkDemo(url: string | null): Promise<DemoCheck | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { url, ok: false, status: null, finalUrl: null, problem: "The link is not a web address." };
    }
  } catch {
    return { url, ok: false, status: null, finalUrl: null, problem: "The link is not a valid URL." };
  }

  try {
    const response = await safeFetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Old-Vibe review (demo check)" },
    });
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("text/html") ? await readCapped(response, 20_000) : "";
    const parked = PARKED.find((entry) => entry.pattern.test(body));

    const problem = parked
      ? `It shows ${parked.label}.`
      : response.status >= 400
        ? `It answers ${response.status}.`
        : null;

    return { url, ok: problem === null, status: response.status, finalUrl: response.url, problem };
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return { url, ok: false, status: null, finalUrl: null, problem: "It points at a private network address, so it was not opened." };
    }
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      url,
      ok: false,
      status: null,
      finalUrl: null,
      problem: timedOut ? "It did not answer within 8 seconds." : "It could not be reached.",
    };
  }
}
