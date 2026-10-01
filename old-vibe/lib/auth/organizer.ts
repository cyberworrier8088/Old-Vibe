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
  // Fail closed: with no list configured nobody is a reviewer. Everyone is only possible by
  // explicitly setting ORGANIZER_SLACK_IDS=*.
  if (list.includes("*")) return true;
  return list.includes(user.slackId.trim().toUpperCase());
}

export async function requireOrganizer() {
  const { getCurrentUser } = await import("./users");
  const user = await getCurrentUser();
  return isOrganizer(user) ? user : null;
}
