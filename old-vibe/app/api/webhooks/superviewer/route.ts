import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { decision as decisionEnum, projects, webhookEvents } from "@/lib/db/schema";
import { applyDecision, clearDecision } from "@/lib/review/decisions";
import type { DecisionKind } from "@/lib/review/decisions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDecision(value: unknown): value is DecisionKind {
  return typeof value === "string" && (decisionEnum.enumValues as readonly string[]).includes(value);
}

/** Compare the Authorization header to the shared secret without leaking where they differ. */
function authorised(header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.SUPERVIEWER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[superviewer] webhook received but SUPERVIEWER_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // TODO: Implement actual webhook signature verification for Superviewer.
  // We'll trust it for now in the scaffold if the secret matches a header.
  if (!authorised(request.headers.get("Authorization"), secret)) {
    console.error(`[superviewer] rejected delivery: invalid signature`);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    console.error(`[superviewer] delivery was not json`);
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const db = getDb();
  const externalId = typeof body.external_id === "string" ? body.external_id : null;
  let projectId: string | null = null;

  if (externalId && UUID.test(externalId)) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, externalId))
      .limit(1);
    projectId = project?.id ?? null;
  }

  if (externalId && !projectId) {
    console.error(`[superviewer] delivery names unknown project ${externalId}`);
  }

  const deliveryId = typeof body.delivery_id === "string" ? body.delivery_id : Date.now().toString();

  const [recorded] = await db
    .insert(webhookEvents)
    .values({
      deliveryId,
      projectId,
      event: typeof body.event === "string" ? body.event : "unknown",
      payload: body,
    })
    .onConflictDoNothing({ target: webhookEvents.deliveryId })
    .returning({ deliveryId: webhookEvents.deliveryId });

  if (!recorded) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Placeholder for Superviewer logic depending on their event structure.
  if (body.event === "review.reverted" || body.event === "review.requeued") {
    if (!projectId) return NextResponse.json({ ok: true });

    const cleared = await clearDecision(projectId);
    if (cleared.status === "not_found") {
      console.error(`[superviewer] cannot clear unknown project ${projectId}`);
    }
    return NextResponse.json({ ok: true, cleared: cleared.status === "cleared" });
  }

  const decision = body.decision; // e.g. "approved", "rejected", "changes"
  if (decision !== undefined && decision !== null && !isDecision(decision)) {
    // Recorded above for inspection, but never written to the project: an unknown value would
    // otherwise fail the database enum and turn the delivery into a 500 that gets retried.
    console.error(`[superviewer] delivery carries an unknown decision for ${projectId ?? externalId}`);
    return NextResponse.json({ ok: true, applied: false });
  }

  if (isDecision(decision) && projectId) {
    const minutes = body.approved_minutes;
    const result = await applyDecision({
      projectId,
      decision,
      approvedMinutes: typeof minutes === "number" && Number.isFinite(minutes) ? Math.round(minutes) : 0,
      noteToMaker: typeof body.note_to_maker === "string" ? body.note_to_maker : null,
    });

    if (result.status !== "applied") {
      console.error(
        `[superviewer] delivery could not be applied to ${projectId}: ${result.status}`,
      );
    }

    return NextResponse.json({ ok: true, applied: result.status === "applied" });
  }

  return NextResponse.json({ ok: true });
}
