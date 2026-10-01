import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching a URL a maker typed is a way into our own network (SSRF): http://localhost:5432,
 * cloud metadata at 169.254.169.254, a router on 192.168.x.x. These requests only go to public
 * addresses, and redirects are followed one hop at a time so every hop is checked again.
 */

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? privateV4(mapped[1]) : false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return privateV4(ip);
  if (kind === 6) return privateV6(ip);
  return true;
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

export class BlockedUrlError extends Error {
  constructor() {
    super("That address points inside a private network.");
    this.name = "BlockedUrlError";
  }
}

/** fetch() for untrusted URLs: public http(s) only, at most `maxHops` redirects, each checked. */
export async function safeFetch(
  url: string,
  init: RequestInit & { maxHops?: number } = {},
): Promise<Response> {
  const { maxHops = 4, ...rest } = init;
  let current = new URL(url);

  for (let hop = 0; hop <= maxHops; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new BlockedUrlError();
    if (!(await hostIsPublic(current.hostname))) throw new BlockedUrlError();

    const response = await fetch(current, { ...rest, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects.");
}
