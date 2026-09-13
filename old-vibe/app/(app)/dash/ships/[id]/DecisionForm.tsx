"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

import styles from "./page.module.css";

const OPTIONS = [
  { key: "approved", label: "approve" },
  { key: "changes", label: "ask for changes" },
  { key: "rejected", label: "not approved" },
] as const;

const PRESETS: Record<string, string[]> = {
  approved: [
    "Awesome project! The retro aesthetic is spot on.",
    "Approved! Great commit activity and clean README.",
    "Well-documented code and fun demo to test.",
  ],
  changes: [
    "Live demo link does not work or gives 404. Please fix.",
    "README is missing run/setup instructions.",
    "Please track more coding hours in Hackatime during the event window.",
  ],
  rejected: [
    "Does not match Old-Vibe retro aesthetic guidelines.",
    "Code appears pre-existing or lacks commits during event dates.",
  ],
};

export function DecisionForm({
  id,
  trackedProjects,
  defaultHours = 0,
  totalTrackedFormatted,
}: {
  id: string;
  trackedProjects: number;
  defaultHours?: number;
  totalTrackedFormatted?: string;
}) {
  const router = useRouter();
  const ids = useId();

  const [decision, setDecision] = useState<string>("approved");
  const [hours, setHours] = useState(defaultHours > 0 ? String(defaultHours) : "");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<{ field?: string; message: string } | null>(null);
  const [working, setWorking] = useState(false);

  const errorFor = (field: string) => (problem?.field === field ? problem.message : undefined);

  async function record() {
    setWorking(true);
    setProblem(null);

    const response = await fetch(`/api/admin/ships/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        approvedHours: Number(hours),
        noteToMaker: note,
      }),
    });

    if (response.ok) {
      router.refresh();
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { field?: string; message?: string };
    setProblem({ field: body.field, message: body.message ?? "That did not save." });
    setWorking(false);
  }

  return (
    <div className={styles.form}>
      {problem && !problem.field ? <Banner tone="bad">{problem.message}</Banner> : null}

      <div className={styles.choices} role="group" aria-label="decision">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={styles.choice}
            aria-pressed={decision === option.key}
            onClick={() => setDecision(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {decision === "approved" ? (
        <Field
          id={`${ids}-hours`}
          label="hours to approve"
          help={
            defaultHours > 0
              ? `Auto-detected ${totalTrackedFormatted ?? `${defaultHours}h`} eligible tracked work.`
              : `They picked ${trackedProjects} Hackatime ${trackedProjects === 1 ? "project" : "projects"}.`
          }
          error={errorFor("approvedHours")}
        >
          <Input
            value={hours}
            inputMode="decimal"
            placeholder={defaultHours > 0 ? String(defaultHours) : "12"}
            onChange={(event) => setHours(event.target.value)}
          />
          {defaultHours > 0 ? (
            <div className={styles.quickHours}>
              <button
                type="button"
                className={styles.quickBtn}
                onClick={() => setHours(String(defaultHours))}
              >
                ⚡ Full: {defaultHours}h
              </button>
              <button
                type="button"
                className={styles.quickBtn}
                onClick={() => setHours(String(Math.round(defaultHours * 0.75 * 10) / 10))}
              >
                75%: {Math.round(defaultHours * 0.75 * 10) / 10}h
              </button>
              <button
                type="button"
                className={styles.quickBtn}
                onClick={() => setHours(String(Math.round(defaultHours * 0.5 * 10) / 10))}
              >
                50%: {Math.round(defaultHours * 0.5 * 10) / 10}h
              </button>
            </div>
          ) : null}
        </Field>
      ) : null}

      <Field
        id={`${ids}-note`}
        label="note to the maker"
        help="This is what the maker sees in their feedback."
        error={errorFor("noteToMaker")}
      >
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        <div className={styles.presets}>
          <span className={styles.presetLabel}>Quick Feedback Presets:</span>
          <div className={styles.presetChips}>
            {PRESETS[decision]?.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.presetChip}
                onClick={() => setNote((prev) => (prev ? `${prev} ${preset}` : preset))}
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Button onClick={record} loading={working} loadingLabel="saving…">
        record decision
      </Button>
    </div>
  );
}
