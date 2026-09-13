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
  const scope = searchParams.get("scope") ?? "project"; // "project" or "all"

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

  const claimedProjects =
    project.hackatimeProjects && project.hackatimeProjects.length > 0
      ? project.hackatimeProjects
      : project.title
        ? [project.title]
        : [];
  const claimedSet = new Set(claimedProjects.map((p) => p.trim().toLowerCase()));

  let queryStart: string | undefined = undefined;
  let queryEnd: string | undefined = undefined;
  let makerProfile: { username?: string; trust_factor?: { trust_level?: string; trust_value?: number } } | null = null;

  try {
    const { getHackatimeProfile, getHackatimeProjectDetails } = await import(
      "@/lib/hackatime/client"
    );
    makerProfile = await getHackatimeProfile(token);
    const username = makerProfile?.username || maker.slackId;
    if (username && claimedProjects.length > 0 && scope !== "all") {
      const details = await Promise.allSettled(
        claimedProjects.map((p) => getHackatimeProjectDetails(token, username, p)),
      );
      for (const res of details) {
        if (res.status === "fulfilled" && res.value) {
          if (res.value.first_heartbeat && (!queryStart || res.value.first_heartbeat < queryStart)) {
            queryStart = res.value.first_heartbeat;
          }
          if (res.value.last_heartbeat && (!queryEnd || res.value.last_heartbeat > queryEnd)) {
            queryEnd = res.value.last_heartbeat;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[hackatime] failed to fetch project details for boundaries:", err);
  }

  if (!queryStart) {
    queryStart = `${EVENT_START_DATE}T00:00:00Z`;
  }

  const { heartbeats, total_seconds } = await getHackatimeHeartbeats(
    token,
    queryStart,
    queryEnd,
  );

  let exportHeartbeats = heartbeats;
  if (scope !== "all") {
    // Filter strictly to claimed projects
    const matched = heartbeats.filter(
      (hb) => hb.project && claimedSet.has(hb.project.trim().toLowerCase()),
    );
    if (matched.length > 0) {
      exportHeartbeats = matched;
    } else if (claimedProjects.length > 0) {
      const fullRes = await getHackatimeHeartbeats(token);
      if (fullRes.heartbeats?.length) {
        exportHeartbeats = fullRes.heartbeats.filter(
          (hb) => hb.project && claimedSet.has(hb.project.trim().toLowerCase()),
        );
      }
    }
  }

  const safeTitle = (project.title || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filenamePrefix = scope === "all" ? `all-heartbeats-${maker.slackId}` : `heartbeats-${safeTitle}-${maker.slackId}`;

  // Summary stats
  let writeCount = 0;
  for (const hb of exportHeartbeats) {
    if (hb.is_write) writeCount++;
  }
  const writeRatio = exportHeartbeats.length > 0 ? Math.round((writeCount / exportHeartbeats.length) * 100) : 0;

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

    const rows = exportHeartbeats.map((hb) => {
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
        hb.is_write ? "true" : "false",
        hb.lines ?? "",
      ].join(",");
    });

    const csvContent = [
      `# Tool: Old-Vibe Ari-Inspector Export`,
      `# Scope: ${scope.toUpperCase()}`,
      `# Maker: ${maker.name} (@${maker.slackId})`,
      `# Project: ${project.title}`,
      `# Total Heartbeats: ${exportHeartbeats.length}`,
      `# Write Ratio: ${writeRatio}%`,
      headers.join(","),
      ...rows,
    ].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenamePrefix}.csv"`,
      },
    });
  }

  // Default: JSON export with rich Ari-style audit headers
  const exportPayload = {
    exported_at: new Date().toISOString(),
    event_cutoff_start: EVENT_START_DATE,
    scope,
    maker: {
      name: maker.name,
      slack_id: maker.slackId,
      email: maker.email,
      trust_level: makerProfile?.trust_factor?.trust_level ?? "unknown",
      trust_value: makerProfile?.trust_factor?.trust_value ?? null,
    },
    project: {
      id: project.id,
      title: project.title,
      hackatime_projects: project.hackatimeProjects,
      repo_url: project.repoUrl,
      demo_url: project.demoUrl,
    },
    audit_summary: {
      total_seconds,
      total_hours: total_seconds ? (total_seconds / 3600).toFixed(1) + "h" : "0h",
      total_heartbeats: exportHeartbeats.length,
      writes_count: writeCount,
      write_ratio_percent: writeRatio,
    },
    heartbeats: exportHeartbeats,
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenamePrefix}.json"`,
    },
  });
}
