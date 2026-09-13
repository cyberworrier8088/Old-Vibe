import { localBackend } from "./local";
import { superviewerBackend } from "./superviewer";
import type { ReviewBackend } from "./types";

export * from "./types";

export function reviewIsExternal(): boolean {
  return Boolean(process.env.SUPERVIEWER_PROGRAM_ID && process.env.SUPERVIEWER_INGEST_SECRET);
}

export function getReviewBackend(): ReviewBackend {
  return reviewIsExternal() ? superviewerBackend : localBackend;
}

export function reviewConfigProblems(): string[] {
  const problems: string[] = [];
  const programId = Boolean(process.env.SUPERVIEWER_PROGRAM_ID);
  const ingest = Boolean(process.env.SUPERVIEWER_INGEST_SECRET);
  const webhook = Boolean(process.env.SUPERVIEWER_WEBHOOK_SECRET);

  if (programId && !ingest) {
    problems.push("SUPERVIEWER_PROGRAM_ID is set but SUPERVIEWER_INGEST_SECRET is not, so ships stay local");
  }
  if (ingest && !programId) {
    problems.push("SUPERVIEWER_INGEST_SECRET is set but SUPERVIEWER_PROGRAM_ID is not, so ships stay local");
  }
  if (reviewIsExternal() && !webhook) {
    problems.push(
      "ships go to superviewer but SUPERVIEWER_WEBHOOK_SECRET is not set, so decisions cannot come back",
    );
  }
  return problems;
}
