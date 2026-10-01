export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_STATE_MAX_AGE = 60 * 10;

export function createOAuthState(returnTo?: string): { nonce: string; state: string } {
  const nonce = crypto.randomUUID();
  const safe = safeReturnTo(returnTo);
  return { nonce, state: safe ? `${nonce}.${encodeURIComponent(safe)}` : nonce };
}

export function parseOAuthState(state: string | null): { nonce: string | null; returnTo?: string } {
  if (!state) return { nonce: null };
  const dot = state.indexOf(".");
  if (dot === -1) return { nonce: state };
  let returnTo: string | undefined;
  try {
    returnTo = safeReturnTo(decodeURIComponent(state.slice(dot + 1)));
  } catch {
    // Malformed escape in an attacker-supplied state: ignore it rather than throw a 500.
  }
  return { nonce: state.slice(0, dot), returnTo };
}

export function safeReturnTo(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  if (value.startsWith("/\\")) return undefined;
  return value;
}
