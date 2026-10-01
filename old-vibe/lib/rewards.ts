export type Reward = {
  name: string;
  cost: number;
  label: string;
};

/** Tracked Hackatime time a project needs before it can be submitted: two hours. */
export const MIN_SUBMISSION_SECONDS = 7200;

export const PAPER_PER_HOUR = 4;
export const PAPER_MAX_RATE = 6;
export const BEANS_PER_HOUR = PAPER_PER_HOUR;

/**
 * What one Paper costs the program in real money, and Hack Club's ceiling for a YSWS reward.
 * Price shop items so the top streak rate stays under the ceiling: 6 Paper x $0.80 = $4.80 an hour.
 */
export const PAPER_USD_VALUE = 0.8;
export const MAX_REWARD_USD_PER_HOUR = 5;

export function usdForPaper(paper: number): number {
  return Math.round(paper * PAPER_USD_VALUE * 100) / 100;
}

/** True while the highest possible hourly rate still fits under the cap. */
export function rewardRateWithinCap(): boolean {
  return PAPER_MAX_RATE * PAPER_USD_VALUE <= MAX_REWARD_USD_PER_HOUR;
}

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
