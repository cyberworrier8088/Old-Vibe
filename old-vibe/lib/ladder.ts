/**
 * Pure rules for bans, with no database access so the review page can preview a sanction in the
 * browser using the same code the server applies.
 */

/** A first violation is a short ban, a second a long one, a third is permanent. Fraud skips it. */
export const LADDER_DAYS = [7, 30] as const;

export type Sanction = { kind: "temp_ban"; days: number; until: Date } | { kind: "permanent_ban" };

export function sanctionFor(priorViolations: number, fraud: boolean, now = new Date()): Sanction {
  if (fraud || priorViolations >= LADDER_DAYS.length) return { kind: "permanent_ban" };
  const days = LADDER_DAYS[priorViolations];
  return { kind: "temp_ban", days, until: new Date(now.getTime() + days * 86_400_000) };
}

export function describeSanction(sanction: Sanction): string {
  return sanction.kind === "permanent_ban" ? "a permanent ban" : `a ${sanction.days}-day ban`;
}

export type BanStatus =
  | { banned: false }
  | { banned: true; permanent: true }
  | { banned: true; permanent: false; until: Date };

export function banStatus(
  user: { bannedUntil: Date | null; bannedPermanently: boolean },
  now = new Date(),
): BanStatus {
  if (user.bannedPermanently) return { banned: true, permanent: true };
  if (user.bannedUntil && user.bannedUntil > now) {
    return { banned: true, permanent: false, until: user.bannedUntil };
  }
  return { banned: false };
}

export function formatBanEnd(status: BanStatus): string {
  if (!status.banned) return "";
  if (status.permanent) return "permanently";
  return `until ${status.until.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
}

export function banMessage(status: BanStatus, reason?: string | null): string {
  if (!status.banned) return "";
  const why = reason ? ` Reason: ${reason}` : "";
  return `Your account is suspended ${formatBanEnd(status)}, so you cannot submit projects or place orders.${why}`;
}
