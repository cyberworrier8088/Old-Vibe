export const HACKATIME_STATE_COOKIE = "hackatime_state";

export const HACKATIME_SCOPES = "profile read";

export type HackatimeTrustFactor = {
  trust_level?: "green" | "blue" | "yellow" | "red" | string;
  trust_value?: number;
};

export type HackatimeProfile = {
  id?: string | number;
  username?: string;
  emails?: string[];
  slack_id?: string;
  github_username?: string;
  trust_factor?: HackatimeTrustFactor;
};

export type HackatimeProject = {
  name: string;
  total_seconds: number;
  created_at?: string;
  most_recent_heartbeat?: string;
  languages?: string[];
  archived?: boolean;
};

export type HackatimeHeartbeat = {
  id?: number;
  created_at?: string;
  time?: number;
  category?: string;
  project?: string;
  language?: string;
  editor?: string;
  operating_system?: string;
  machine?: string;
  entity?: string;
  is_write?: boolean;
  lines?: number;
};

function base(): string {
  return (process.env.HACKATIME_BASE_URL ?? "https://hackatime.hackclub.com").replace(/\/$/, "");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function hackatimeRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/hackatime/callback`;
}

export function hackatimeAuthorizeUrl(state: string, appUrl: string): string {
  const url = new URL(`${base()}/oauth/authorize`);
  url.searchParams.set("client_id", required("HACKATIME_CLIENT_ID"));
  url.searchParams.set("redirect_uri", hackatimeRedirectUri(appUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", HACKATIME_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeHackatimeCode(code: string, appUrl: string): Promise<string> {
  const response = await fetch(`${base()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("HACKATIME_CLIENT_ID"),
      client_secret: required("HACKATIME_CLIENT_SECRET"),
      code,
      redirect_uri: hackatimeRedirectUri(appUrl),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`hackatime token exchange failed with ${response.status}`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("hackatime token exchange returned no access token");
  return body.access_token;
}

async function get<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${base()}${path}`);
  for (const [name, value] of Object.entries(params ?? {})) url.searchParams.set(name, value);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`hackatime ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

export function getHackatimeProfile(token: string): Promise<HackatimeProfile> {
  return get<HackatimeProfile>(token, "/api/v1/authenticated/me");
}

export function getHackatimeProjects(token: string): Promise<{ projects: HackatimeProject[] }> {
  return get<{ projects: HackatimeProject[] }>(token, "/api/v1/authenticated/projects");
}

export type HackatimeSummaryProject = { name: string; total_seconds: number };
export type HackatimeSummaryDay = {
  range?: { start?: string; end?: string; date?: string };
  projects?: HackatimeSummaryProject[];
};

export function getHackatimeSummaries(
  token: string,
  start: string,
  end?: string,
): Promise<{ data: HackatimeSummaryDay[] }> {
  const params: Record<string, string> = { start };
  if (end) params.end = end;
  return get<{ data: HackatimeSummaryDay[] }>(token, "/api/v1/authenticated/summaries", params);
}

export async function getLatestHeartbeat(token: string): Promise<HackatimeHeartbeat | null> {
  try {
    const res = await get<HackatimeHeartbeat | { heartbeat: null }>(
      token,
      "/api/v1/authenticated/heartbeats/latest",
    );
    if (!res || ("heartbeat" in res && res.heartbeat === null)) return null;
    return res as HackatimeHeartbeat;
  } catch {
    return null;
  }
}

export async function getHackatimeStreak(token: string): Promise<number | null> {
  try {
    const res = await get<{ streak_days?: number }>(token, "/api/v1/authenticated/streak");
    return typeof res?.streak_days === "number" ? res.streak_days : null;
  } catch {
    return null;
  }
}

export function getHackatimeProjectsFiltered(
  token: string,
  options?: { projects?: string[]; startDate?: string },
): Promise<{ projects: HackatimeProject[] }> {
  const params: Record<string, string> = {};
  if (options?.projects && options.projects.length > 0) {
    params.projects = options.projects.join(",");
  }
  if (options?.startDate) {
    params.start_date = options.startDate;
  }
  return get<{ projects: HackatimeProject[] }>(token, "/api/v1/authenticated/projects", params);
}

export async function getHackatimeHeartbeats(
  token: string,
  startTime?: string,
  endTime?: string,
): Promise<{ heartbeats: HackatimeHeartbeat[]; total_seconds?: number }> {
  const params: Record<string, string> = {};
  if (startTime) params.start_time = startTime;
  if (endTime) params.end_time = endTime;

  try {
    const data = await get<{
      heartbeats?: HackatimeHeartbeat[];
      total_seconds?: number;
    }>(token, "/api/v1/my/heartbeats", params);

    return {
      heartbeats: Array.isArray(data?.heartbeats) ? data.heartbeats : [],
      total_seconds: data?.total_seconds,
    };
  } catch (err) {
    console.warn("[hackatime] getHackatimeHeartbeats failed:", err);
    return { heartbeats: [] };
  }
}

export type HackatimeProjectDetails = {
  name: string;
  total_seconds: number;
  languages?: string[];
  repo_url?: string;
  total_heartbeats?: number;
  first_heartbeat?: string;
  last_heartbeat?: string;
  most_recent_heartbeat?: string;
  archived?: boolean;
};

export async function getHackatimeProjectDetails(
  token: string,
  username: string,
  projectName: string,
): Promise<HackatimeProjectDetails | null> {
  try {
    return await get<HackatimeProjectDetails>(
      token,
      `/api/v1/users/${encodeURIComponent(username)}/project/${encodeURIComponent(projectName)}`,
    );
  } catch (err) {
    console.warn(`[hackatime] failed to fetch project details for ${projectName}:`, err);
    return null;
  }
}

