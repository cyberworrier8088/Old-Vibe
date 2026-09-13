import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/users";
import { isOrganizer } from "@/lib/auth/organizer";

export const dynamic = "force-dynamic";

export default async function SuperviewerPage() {
  const user = await getCurrentUser();

  if (!user || !isOrganizer(user)) {
    redirect("/superlogin");
  }

  redirect("/dash/ships");
}
