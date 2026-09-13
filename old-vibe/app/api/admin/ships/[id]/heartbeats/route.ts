import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { requireOrganizer } from "@/lib/auth/organizer";
import { open } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { getHackatimeHeartbeats } from "@/lib/hackatime/client";
import { EVENT_START_DATE } from "@/lib/hackatime/projects";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireOrganizer())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";

  const [row] = await getDb()
    .select({ project: projects, maker: users })
    .from(projects)
    .innerJoin(users, eq(projects.userSub, users.sub))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) notFound();

  const { project, maker } = row;

  if (!maker.hackatimeToken) {
    return NextResponse.json(
      { error: "Maker has not connected Hackatime" },
      { status: 400 },
    );
  }

  let token: string;
  try {
    token = open(maker.hackatimeToken);
  } catch {
    return NextResponse.json(
      { error: "Could not open maker Hackatime token" },
      { status: 500 },
    );
  }

  const { heartbeats, total_seconds } = await getHackatimeHeartbeats(
    token,
    `${EVENT_START_DATE}T00:00:00Z`,
  );

  const safeTitle = (project.title || "project").replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "csv") {
    const headers = [
      "time",
      "timestamp",
      "project",
      "entity",
      "language",
      "editor",
      "operating_system",
      "machine",
      "category",
      "is_write",
      "lines",
    ];

    const rows = heartbeats.map((hb) => {
      const dateStr = hb.time ? new Date(hb.time * 1000).toISOString() : hb.created_at ?? "";
      return [
        hb.time ?? "",
        dateStr,
        `"${(hb.project ?? "").replace(/"/g, '""')}"`,
        `"${(hb.entity ?? "").replace(/"/g, '""')}"`,
        `"${(hb.language ?? "").replace(/"/g, '""')}"`,
        `"${(hb.editor ?? "").replace(/"/g, '""')}"`,
        `"${(hb.operating_system ?? "").replace(/"/g, '""')}"`,
        `"${(hb.machine ?? "").replace(/"/g, '""')}"`,
        `"${(hb.category ?? "").replace(/"/g, '""')}"`,
        hb.is_write ?? "",
        hb.lines ?? "",
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="heartbeats-${safeTitle}-${maker.slackId}.csv"`,
      },
    });
  }

  // Default: JSON export
  const exportPayload = {
    exported_at: new Date().toISOString(),
    event_cutoff_start: EVENT_START_DATE,
    maker: {
      name: maker.name,
      slack_id: maker.slackId,
      email: maker.email,
    },
    project: {
      id: project.id,
      title: project.title,
      hackatime_projects: project.hackatimeProjects,
      repo_url: project.repoUrl,
      demo_url: project.demoUrl,
    },
    total_seconds,
    total_heartbeats: heartbeats.length,
    heartbeats,
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="heartbeats-${safeTitle}-${maker.slackId}.json"`,
    },
  });
}
