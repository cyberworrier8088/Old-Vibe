import type { User } from "@/lib/db/schema";

export function organizerSlackIds(): string[] {
  return (process.env.ORGANIZER_SLACK_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

export function isOrganizer(user: Pick<User, "slackId"> | null | undefined): boolean {
  if (!user || !user.slackId?.trim()) return false;
  const list = organizerSlackIds();
  // If specific organizer Slack IDs are provided, restrict to those (supports wildcard '*')
  if (list.length > 0 && !list.includes("*")) {
    return list.includes(user.slackId.trim().toUpperCase());
  }
  // Otherwise, all Slack-verified users have reviewer access
  return true;
}

export async function requireOrganizer() {
  const { getCurrentUser } = await import("./users");
  const user = await getCurrentUser();
  return isOrganizer(user) ? user : null;
}
