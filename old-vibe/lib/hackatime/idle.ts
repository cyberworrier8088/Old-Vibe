import type { HackatimeHeartbeat } from "./client";
import { HEARTBEAT_TIMEOUT_SECONDS } from "./duration";

/**
 * Catches time that is only an editor being poked: an auto key presser, or a macro that keeps the
 * machine awake. Real typing moves the cursor and changes the line count. A long run of write
 * heartbeats on one file where neither moves is not typing.
 */

export type IdleRun = {
  entity: string;
  start: number;
  end: number;
  heartbeats: number;
  seconds: number;
};

/** Fewer write heartbeats than this in a row can be an auto-save, so it is not reported. */
export const MIN_IDLE_HEARTBEATS = 10;

type Timed = HackatimeHeartbeat & { time: number };

function sameSpot(a: Timed, b: Timed): boolean {
  return (
    a.entity === b.entity &&
    a.is_write === true &&
    b.is_write === true &&
    typeof a.lines === "number" &&
    a.lines === b.lines &&
    // Needs the cursor position or line number to be sure; with neither, it says nothing.
    ((typeof a.cursorpos === "number" && a.cursorpos === b.cursorpos) ||
      (typeof a.lineno === "number" && a.lineno === b.lineno))
  );
}

export function findIdleRuns(heartbeats: HackatimeHeartbeat[]): {
  runs: IdleRun[];
  idleSeconds: number;
  longestSeconds: number;
} {
  const sorted = heartbeats
    .filter((hb): hb is Timed => typeof hb.time === "number")
    .sort((a, b) => a.time - b.time);

  const runs: IdleRun[] = [];
  let first = 0;

  const close = (lastIndex: number) => {
    const count = lastIndex - first + 1;
    if (count >= MIN_IDLE_HEARTBEATS) {
      let seconds = 0;
      for (let i = first; i < lastIndex; i++) {
        seconds += Math.min(sorted[i + 1].time - sorted[i].time, HEARTBEAT_TIMEOUT_SECONDS);
      }
      runs.push({
        entity: sorted[first].entity ?? "",
        start: sorted[first].time,
        end: sorted[lastIndex].time,
        heartbeats: count,
        seconds: Math.round(seconds),
      });
    }
  };

  for (let i = 1; i < sorted.length; i++) {
    const continues = sameSpot(sorted[i - 1], sorted[i]) && sorted[i].time - sorted[i - 1].time <= 600;
    if (!continues) {
      close(i - 1);
      first = i;
    }
  }
  if (sorted.length > 0) close(sorted.length - 1);

  return {
    runs,
    idleSeconds: runs.reduce((sum, run) => sum + run.seconds, 0),
    longestSeconds: runs.reduce((max, run) => Math.max(max, run.seconds), 0),
  };
}
