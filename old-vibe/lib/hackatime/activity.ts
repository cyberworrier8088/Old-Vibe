import { open } from "@/lib/crypto";
import type { User } from "@/lib/db/schema";

import { fetchHeartbeats, getHackatimeHours } from "./client";
import type { HackatimeHeartbeat } from "./client";
import { totalsFrom } from "./duration";
import { EVENT_START_DATE } from "./projects";

export type DayActivity = { date: string; seconds: number };
export type NameTotal = { name: string; seconds: number };

export type Activity = {
  /** The last seven days, oldest first, with zeros for days without coding. */
  days: DayActivity[];
  weekSeconds: number;
  todaySeconds: number;
  activeDays: number;
  languages: NameTotal[];
  projects: NameTotal[];
  /** Everything tracked since the program started, as Hackatime counts it. Null if unavailable. */
  eventSeconds: number | null;
};

const DAY_MS = 86_400_000;
const SPAN = 7;
const TTL_MS = 120_000;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function top(map: Map<string, number>, limit: number): NameTotal[] {
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds: Math.round(seconds) }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

/** Pure: turns a week of heartbeats into what the dashboard draws. Days are UTC days. */
export function activityFrom(
  heartbeats: HackatimeHeartbeat[],
  today: Date,
  eventSeconds: number | null = null,
): Activity {
  const totals = totalsFrom(heartbeats);

  const days: DayActivity[] = [];
  for (let i = SPAN - 1; i >= 0; i--) {
    const date = isoDay(new Date(today.getTime() - i * DAY_MS));
    days.push({ date, seconds: Math.round(totals.byDay.get(date) ?? 0) });
  }

  return {
    days,
    weekSeconds: days.reduce((sum, day) => sum + day.seconds, 0),
    todaySeconds: days[days.length - 1].seconds,
    activeDays: days.filter((day) => day.seconds > 0).length,
    languages: top(totals.byLanguage, 5),
    projects: top(totals.byProject, 5),
    eventSeconds,
  };
}

const cache = new Map<string, { at: number; activity: Activity }>();

/** The maker's last seven days of coding, or null when Hackatime is not connected or unreachable. */
export async function getActivity(
  user: Pick<User, "sub" | "hackatimeToken">,
): Promise<Activity | null> {
  if (!user.hackatimeToken) return null;

  const hit = cache.get(user.sub);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.activity;

  try {
    const token = open(user.hackatimeToken);
    const now = new Date();
    const start = isoDay(new Date(now.getTime() - (SPAN - 1) * DAY_MS));
    const end = isoDay(now);

    const [week, eventSeconds] = await Promise.all([
      fetchHeartbeats(token, `${start}T00:00:00Z`, `${end}T23:59:59Z`),
      getHackatimeHours(token, EVENT_START_DATE),
    ]);

    const activity = activityFrom(week.heartbeats, now, eventSeconds);
    cache.set(user.sub, { at: Date.now(), activity });
    return activity;
  } catch (error) {
    console.warn("[hackatime] activity fetch failed:", error);
    return null;
  }
}
