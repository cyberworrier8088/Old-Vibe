import type { HackatimeHeartbeat } from "./client";

/**
 * Time between two heartbeats counts only up to this long. A longer gap means the maker stepped
 * away, and the gap is not coding time. This is the usual WakaTime rule that Hackatime follows.
 */
export const HEARTBEAT_TIMEOUT_SECONDS = 120;

export type Totals = {
  seconds: number;
  byDay: Map<string, number>;
  byProject: Map<string, number>;
  byLanguage: Map<string, number>;
};

const add = (map: Map<string, number>, key: string | undefined, seconds: number) => {
  if (key && seconds > 0) map.set(key, (map.get(key) ?? 0) + seconds);
};

const utcDay = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/**
 * Turns a heartbeat stream into coding time. Each heartbeat is credited with the time until the
 * next one, capped at the timeout, and that time is attributed to the heartbeat's own day, project
 * and language. The last heartbeat has nothing after it, so it adds nothing.
 */
export function totalsFrom(
  heartbeats: HackatimeHeartbeat[],
  dayOf: (epochSeconds: number) => string = utcDay,
): Totals {
  const sorted = heartbeats
    .filter((hb): hb is HackatimeHeartbeat & { time: number } => typeof hb.time === "number")
    .sort((a, b) => a.time - b.time);

  const totals: Totals = {
    seconds: 0,
    byDay: new Map(),
    byProject: new Map(),
    byLanguage: new Map(),
  };

  for (let i = 0; i < sorted.length - 1; i++) {
    const credit = Math.min(sorted[i + 1].time - sorted[i].time, HEARTBEAT_TIMEOUT_SECONDS);
    if (credit <= 0) continue;

    totals.seconds += credit;
    add(totals.byDay, dayOf(sorted[i].time), credit);
    add(totals.byProject, sorted[i].project, credit);
    add(totals.byLanguage, sorted[i].language, credit);
  }

  return totals;
}
