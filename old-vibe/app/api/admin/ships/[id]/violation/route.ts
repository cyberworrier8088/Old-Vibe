import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isOrganizer } from "@/lib/auth/organizer";
import { getCurrentUser } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import type { Project, User } from "@/lib/db/schema";
import { describeSanction } from "@/lib/ladder";
import { liftBan, recordViolation } from "@/lib/moderation";

export const dynamic = "force-dynamic";

type Body = { reason?: string; fraud?: boolean; mistake?: boolean };

type Context =
  | { ok: false; response: NextResponse }
  | { ok: true; organizer: User; body: Body; reason: string; project: Project; maker: User };

const fail = (response: NextResponse): Context => ({ ok: false, response });

async function load(request: Request, params: Promise<{ id: string }>): Promise<Context> {
  const organizer = await getCurrentUser();
  if (!organizer || !isOrganizer(organizer)) {
    return fail(NextResponse.json({ error: "not found" }, { status: 404 }));
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail(NextResponse.json({ error: "unreadable" }, { status: 400 }));
  }

  const reason = body.reason?.trim() ?? "";
  if (reason.length < 10 || reason.length > 1000) {
    return fail(
      NextResponse.json(
        {
          error: "invalid",
          field: "reason",
          message: "Give a reason of at least 10 characters. The maker will read it.",
        },
        { status: 422 },
      ),
    );
  }

  const { id } = await params;
  const [row] = await getDb()
    .select({ project: projects, maker: users })
    .from(projects)
    .innerJoin(users, eq(projects.userSub, users.sub))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) return fail(NextResponse.json({ error: "not found" }, { status: 404 }));

  return { ok: true, organizer, body, reason, project: row.project, maker: row.maker };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load(request, params);
  if (!ctx.ok) return ctx.response;

  if (ctx.maker.sub === ctx.organizer.sub || isOrganizer(ctx.maker)) {
    return NextResponse.json(
      { error: "forbidden", message: "Organizers cannot be banned from here." },
      { status: 403 },
    );
  }

  const sanction = await recordViolation({
    userSub: ctx.maker.sub,
    issuedBy: ctx.organizer.sub,
    reason: ctx.reason,
    projectId: ctx.project.id,
    fraud: ctx.body.fraud === true,
  });

  return NextResponse.json({ ok: true, sanction: describeSanction(sanction) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load(request, params);
  if (!ctx.ok) return ctx.response;

  await liftBan({
    userSub: ctx.maker.sub,
    issuedBy: ctx.organizer.sub,
    reason: ctx.reason,
    mistake: ctx.body.mistake === true,
  });

  return NextResponse.json({ ok: true });
}
