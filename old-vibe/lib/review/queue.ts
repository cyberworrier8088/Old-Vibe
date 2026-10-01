/** How long a submission has waited, and whether that is too long. Pure. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Waiting = { label: string; tone: "ok" | "warn" | "bad" };

/** Under two days is fine, up to a week is late, beyond that the maker has waited too long. */
export function waiting(submittedAt: Date, now = new Date()): Waiting {
  const ms = Math.max(0, now.getTime() - submittedAt.getTime());
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
  return { label, tone: ms >= 7 * DAY ? "bad" : ms >= 2 * DAY ? "warn" : "ok" };
}
