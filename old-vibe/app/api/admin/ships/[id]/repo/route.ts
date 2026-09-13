import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { requireOrganizer } from "@/lib/auth/organizer";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { githubSlug, repoIsReachable } from "@/lib/superviewer/repo";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireOrganizer())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { repoUrl?: string };
  const nextRepoUrl = body.repoUrl?.trim();

  if (!nextRepoUrl) {
    return NextResponse.json({ error: "Repository URL required" }, { status: 400 });
  }

  const slug = githubSlug(nextRepoUrl);
  if (!slug) {
    return NextResponse.json(
      { error: "Must be a valid GitHub repository URL (e.g. https://github.com/owner/repo)" },
      { status: 400 },
    );
  }

  const reachable = await repoIsReachable(nextRepoUrl);
  if (reachable === false) {
    return NextResponse.json(
      { error: "That repository does not appear reachable (404 or private)." },
      { status: 400 },
    );
  }

  const [updated] = await getDb()
    .update(projects)
    .set({ repoUrl: nextRepoUrl })
    .where(eq(projects.id, id))
    .returning({ id: projects.id, repoUrl: projects.repoUrl });

  if (!updated) notFound();

  return NextResponse.json({ success: true, project: updated });
}
