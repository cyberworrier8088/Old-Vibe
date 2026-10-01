export type Reward = {
  name: string;
  cost: number;
  label: string;
};

export const PAPER_PER_HOUR = 4;
export const PAPER_MAX_RATE = 6;
export const BEANS_PER_HOUR = PAPER_PER_HOUR;

/** Base 4 paper/hr + 0.1 per 2-day streak, capped at 6 */
export function paperRateForStreak(streakDays: number): number {
  const bonus = Math.floor(Math.max(0, streakDays) / 2) * 0.1;
  return Math.min(PAPER_MAX_RATE, PAPER_PER_HOUR + bonus);
}

/** The part of the hourly rate that comes from the streak alone. */
export function streakBonusForStreak(streakDays: number): number {
  return paperRateForStreak(streakDays) - PAPER_PER_HOUR;
}

/**
 * Paper earned for approved minutes. Kept here, free of any database import, so the reviewer's
 * live preview and the ledger entry written on approval can never disagree.
 */
export function paperForMinutes(minutes: number | null | undefined, streak: number = 0): number {
  if (!minutes || minutes <= 0) return 0;
  const rate = paperRateForStreak(streak);
  return Math.round((minutes / 60) * rate);
}

export const REWARDS: Reward[] = [
  { name: "book grant", cost: 5, label: "Book" },
  { name: "hardware grant", cost: 5, label: "Hardware" },
  { name: "hosting grant", cost: 5, label: "Hosting" },
  { name: "energy drink grant", cost: 5, label: "Energy Drink" },
  { name: "chrome web dev extension", cost: 5, label: "Extension" },
];
