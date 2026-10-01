import type { PriorShip } from "./unified";

/**
 * Only work after the start counts. A program that paid for a repository before then paid for older
 * hours; one that paid while Old-Vibe ran may be paying for the same hours.
 *
 * Kept apart from evidence.ts, which reaches the network, so code that runs in the browser can use it.
 */
export function shippedDuring(ship: Pick<PriorShip, "approvedAt">, eventStart: string): boolean {
  return ship.approvedAt !== null && ship.approvedAt * 1000 >= Date.parse(`${eventStart}T00:00:00Z`);
}
