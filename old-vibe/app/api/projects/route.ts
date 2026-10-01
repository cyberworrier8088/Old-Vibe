import { and, arrayOverlaps, eq, ilike, inArray, isNull, isNotNull, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { validateSubmission } from "@/lib/superviewer/payload";
import { githubSlug, repoHasReadme, repoIsReachable } from "@/lib/superviewer/repo";
import { canShip, checkEligibility } from "@/lib/auth/eligibility";
import { getCurrentUser } from "@/lib/auth/users";
import { banBlock } from "@/lib/moderation";
import { getDb } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { getReviewBackend, reviewIsExternal } from "@/lib/review";
import type { ReviewSubmission } from "@/lib/review";
import { getPickerProjects } from "@/lib/hackatime/projects";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  title?: string;
  description?: string;
  repoUrl?: string;
  demoUrl?: string;
  thumbnailUrl?: string;
  hackatimeProjects?: string[];
  updateMessage?: string;
};

function isUniqueViolation(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return candidates.some((value) => (value as { code?: string })?.code === "23505");
}

function invalid(field: string, message: string) {
  return NextResponse.json({ error: "invalid", field, message }, { status: 422 });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const banned = await banBlock(user);
  if (banned) return banned;

  if (reviewIsExternal() && !canShip(await checkEligibility({ slackId: user.slackId }))) {
    return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return invalid("", "That request was not readable.");
  }

  const title = body.title?.trim() ?? "";
  if (!title) return invalid("title", "Give it a name.");

  const candidate: ReviewSubmission = {
    externalId: "pending",
    title,
    description: body.description?.trim() ?? "",
    repoUrl: body.repoUrl?.trim() ?? "",
    demoUrl: body.demoUrl?.trim() ?? "",
    thumbnailUrl: body.thumbnailUrl?.trim() ?? "",
    hackatimeProjects: body.hackatimeProjects ?? [],
    maker: { email: user.email, name: user.name, slackId: user.slackId },
    updateMessage: body.updateMessage,
  };

  // const cutoffDate = new Date("2026-09-11T00:00:00Z");
  // if (new Date() > cutoffDate) {
  //   return invalid("", "The deadline for submissions was September 11, 2026. Submissions are now closed.");
  // }

  const pickerProjects = await getPickerProjects(user);
  if (!pickerProjects) {
    return invalid("hackatime_projects", "Hackatime is not connected.");
  }
  const totalSeconds = candidate.hackatimeProjects.reduce((sum, key) => {
    const proj = pickerProjects.find((p) => p.key === key);
    return sum + (proj ? proj.seconds : 0);
  }, 0);
  if (totalSeconds < 7200) { // 2 hours
    return invalid("hackatime_projects", "You must have at least 2 hours (7200 seconds) of Hackatime tracked to submit this project.");
  }

  const problem = validateSubmission(candidate);
  if (problem) return invalid(problem.field, problem.message);

  const reachable = await repoIsReachable(candidate.repoUrl);
  if (reachable === false) {
    return invalid(
      "repo_url",
      "We cannot see that repository. Is it public, and is the link right?",
    );
  }

  if ((await repoHasReadme(candidate.repoUrl)) === false) {
    return invalid(
      "repo_url",
      "That repository needs a README saying what the project is and how to run it.",
    );
  }

  const db = getDb();

  // One repository, one submission: the same repo cannot be shipped by two makers (or re-shipped
  // under a new title). Compared on the owner/name slug so .git, case and trailing slashes do not
  // matter. The message never says who has it.
  const slug = githubSlug(candidate.repoUrl)?.toLowerCase();
  if (slug) {
    const taken = await db
      .select({ repoUrl: projects.repoUrl, id: projects.id })
      .from(projects)
      .where(and(isNotNull(projects.submittedAt), ilike(projects.repoUrl, `%${slug}%`)));
    const clash = taken.find(
      (row) =>
        row.repoUrl &&
        githubSlug(row.repoUrl)?.toLowerCase() === slug &&
        row.id !== body.id,
    );
    if (clash) {
      return invalid(
        "repo_url",
        "That repository has already been submitted. Each repository can only be shipped once.",
      );
    }
  }

  // Prevent double dipping: a Hackatime project can only be claimed by one submission. Project
  // names are free-form labels that belong to a single Hackatime account, so only claims made by
  // this maker (or by another account linked to the same Hackatime account) can clash. Looking
  // at everyone's claims would block makers who merely picked a common name like "website", and
  // would reveal other makers' project titles in the error.
  if (candidate.hackatimeProjects.length > 0) {
    const sameOwner = user.hackatimeId
      ? or(
          eq(projects.userSub, user.sub),
          inArray(
            projects.userSub,
            db.select({ sub: users.sub }).from(users).where(eq(users.hackatimeId, user.hackatimeId)),
          ),
        )
      : eq(projects.userSub, user.sub);

    const [clash] = await db
      .select({ title: projects.title, hackatimeProjects: projects.hackatimeProjects })
      .from(projects)
      .where(
        and(
          isNotNull(projects.submittedAt),
          body.id ? ne(projects.id, body.id) : undefined,
          sameOwner,
          arrayOverlaps(projects.hackatimeProjects, candidate.hackatimeProjects),
        ),
      )
      .limit(1);

    if (clash) {
      const duplicate = candidate.hackatimeProjects.find((key) =>
        clash.hackatimeProjects.includes(key),
      );
      return invalid(
        "hackatime_projects",
        `The Hackatime project "${duplicate}" was already claimed for "${clash.title}". Double dipping is not allowed!`,
      );
    }
  }

  const values = {
    title,
    description: body.description?.trim() ?? null,
    repoUrl: body.repoUrl?.trim() ?? null,
    demoUrl: body.demoUrl?.trim() ?? null,
    thumbnailUrl: body.thumbnailUrl?.trim() ?? null,
    hackatimeProjects: body.hackatimeProjects ?? [],
    trackedSeconds: totalSeconds,
  };

  let row;
  try {
    if (body.id) {
      const existing = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, body.id), eq(projects.userSub, user.sub)))
        .limit(1);
      if (existing.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (existing[0].submittedAt && !existing[0].decision) {
        return NextResponse.json({ error: "already_queued" }, { status: 409 });
      }
      [row] = await db.update(projects).set(values).where(and(eq(projects.id, body.id), eq(projects.userSub, user.sub))).returning();
    } else {
      [row] = await db
        .insert(projects)
        .values({ ...values, userSub: user.sub })
        .returning();
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "duplicate_repo", message: "You already have a project on that repository." },
        { status: 409 },
      );
    }
    throw error;
  }

  // Hand the ship to the review backend (a no-op log line when reviewing locally). It was
  // dropped from this route by accident, which left first-time submissions out of an external
  // Superviewer; only resends reached it.
  const outcome = await getReviewBackend().submit({ ...candidate, externalId: row.id });

  if (outcome.status === "rejected") return invalid(outcome.field ?? "", outcome.message);
  if (outcome.status === "already_queued") {
    return NextResponse.json({ error: "already_queued" }, { status: 409 });
  }
  if (outcome.status === "unavailable") {
    return NextResponse.json({ error: "unavailable", message: outcome.message }, { status: 503 });
  }

  await db
    .update(projects)
    .set({ submittedAt: new Date(), decision: null, noteToMaker: null, decidedAt: null })
    .where(and(eq(projects.id, row.id), isNull(projects.decidedAt)));

  return NextResponse.json({ ok: true, id: row.id, status: "queued" });
}
