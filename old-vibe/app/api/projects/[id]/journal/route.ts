import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { projects, projectJournals } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Body = {
  content?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { id } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "no_content" }, { status: 422 });

  const db = getDb();

  // Validate the project belongs to the user
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userSub, user.sub)))
    .limit(1);

  if (existing.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  const project = existing[0];
  if (project.submittedAt) {
    return NextResponse.json({ error: "already_submitted", message: "Cannot add journals to submitted projects." }, { status: 409 });
  }

  await db.insert(projectJournals).values({
    projectId: id,
    userSub: user.sub,
    content,
  });

  return NextResponse.json({ ok: true });
}
