/**
 * Which other projects of the same maker really claim the Hackatime hours under review.
 * Pure, so the review page and the submit check agree on what counts.
 */

export type SiblingState = "draft" | "pending" | "approved" | "changes" | "rejected" | "withdrawn";

type Sibling = {
  hackatimeProjects: string[];
  decision: string | null;
  submittedAt: Date | string | null;
};

export function siblingState(sibling: Pick<Sibling, "decision" | "submittedAt">): SiblingState {
  if (!sibling.submittedAt) return "draft";
  if (!sibling.decision) return "pending";
  if (
    sibling.decision === "approved" ||
    sibling.decision === "changes" ||
    sibling.decision === "rejected" ||
    sibling.decision === "withdrawn"
  ) {
    return sibling.decision;
  }
  return "pending";
}

/**
 * A claim is live while the project could still be paid for those hours: waiting, approved, or sent
 * back for changes. A draft never claimed anything, and a rejected or withdrawn project released
 * its hours, so reusing the Hackatime project for a new submission is not double dipping.
 */
export function claimsHours(sibling: Pick<Sibling, "decision" | "submittedAt">): boolean {
  const state = siblingState(sibling);
  return state === "pending" || state === "approved" || state === "changes";
}

const norm = (name: string) => name.trim().toLowerCase();

/** The Hackatime project names a live sibling shares with the project under review. */
export function sharedHackatimeProjects(sibling: Sibling, claimed: string[]): string[] {
  const mine = new Set(claimed.map(norm));
  return sibling.hackatimeProjects.filter((name) => mine.has(norm(name)));
}

export const STATE_LABEL: Record<SiblingState, string> = {
  draft: "DRAFT",
  pending: "PENDING",
  approved: "APPROVED",
  changes: "CHANGES ASKED",
  rejected: "REJECTED",
  withdrawn: "WITHDRAWN",
};
