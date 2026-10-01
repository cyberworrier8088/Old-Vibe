const LIBPQ_ONLY = ["sslrootcert", "sslcert", "sslkey", "sslcrl", "sslcompression"];

/** Hosts that never leave the machine or the compose network, so TLS adds nothing there. */
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db"]);

/** Passwords that ship in .env.example and docker-compose. They must never reach production. */
const KNOWN_WEAK = new Set(["3am", "password", "postgres", "changeme", "admin"]);

export function connectionUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  for (const key of LIBPQ_ONLY) url.searchParams.delete(key);
  return url.toString();
}

/** Throws in production when the database is configured in a way that should not be shipped. */
export function assertSafeForProduction(raw: string, env: string | undefined = process.env.NODE_ENV) {
  if (env !== "production") return;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }

  const password = decodeURIComponent(url.password);
  if (password.length < 16 || KNOWN_WEAK.has(password.toLowerCase())) {
    throw new Error("DATABASE_URL uses a weak or default password. Use a random one of 16+ characters.");
  }
}

/** Require TLS in production unless the database is on the same machine or compose network. */
export function wantsTls(raw: string, env: string | undefined = process.env.NODE_ENV): boolean {
  if (env !== "production") return false;
  try {
    const url = new URL(raw);
    if (url.searchParams.get("sslmode") === "disable") return false;
    return !PRIVATE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
