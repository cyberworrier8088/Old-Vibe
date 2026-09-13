import type { ReviewBackend, ReviewSubmission, SubmitOutcome, WithdrawOutcome } from "./types";

export function superviewerBaseUrl() {
  return process.env.SUPERVIEWER_URL ?? "https://superviewer.hackclub.com";
}

export function superviewerProgramId() {
  return process.env.SUPERVIEWER_PROGRAM_ID ?? "";
}

async function post(path: string, body: string): Promise<Response> {
  const secret = process.env.SUPERVIEWER_INGEST_SECRET;
  if (!secret) throw new Error("SUPERVIEWER_INGEST_SECRET is not set");

  return fetch(`${superviewerBaseUrl()}/api/ingest/${superviewerProgramId()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`, // Basic bearer auth scaffold
    },
    body,
    cache: "no-store",
  });
}

export const superviewerBackend: ReviewBackend = {
  name: "superviewer",

  async submit(submission: ReviewSubmission): Promise<SubmitOutcome> {
    const body = JSON.stringify(submission);

    let response: Response;
    try {
      response = await post("", body);
    } catch (error) {
      console.error("[superviewer] ingest request failed", error);
      return { status: "unavailable", message: "We could not reach the reviewers just now." };
    }

    if (response.status === 409) return { status: "already_queued" };

    if (response.status === 202 || response.status === 200) {
      return { status: "queued" };
    }

    if (response.status === 422) {
      console.error(`[superviewer] ingest rejected ${submission.externalId}`);
      return {
        status: "rejected",
        field: "unknown",
        message: "The reviewers could not read that submission.",
      };
    }

    console.error(`[superviewer] ingest returned ${response.status} for ${submission.externalId}`);
    return { status: "unavailable", message: "We could not reach the reviewers just now." };
  },

  async withdraw(externalId: string): Promise<WithdrawOutcome> {
    const body = JSON.stringify({ external_id: externalId });

    let response: Response;
    try {
      response = await post("/withdraw", body);
    } catch (error) {
      console.error("[superviewer] withdraw request failed", error);
      return { status: "unavailable", message: "We could not reach the reviewers just now." };
    }

    if (response.ok) return { status: "withdrawn" };
    if (response.status === 404) return { status: "not_queued" };

    console.error(`[superviewer] withdraw returned ${response.status} for ${externalId}`);
    return { status: "unavailable", message: "We could not reach the reviewers just now." };
  },
};
