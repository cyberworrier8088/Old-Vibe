"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { PaperIcon } from "@/components/ui/PaperIcon";
import { paperRateForStreak } from "@/lib/rewards";

import styles from "./page.module.css";

const OPTIONS = [
  { key: "approved", label: "Approve", tone: "ok" },
  { key: "changes", label: "Ask for Changes", tone: "warn" },
  { key: "rejected", label: "Not Approved", tone: "bad" },
] as const;

const PRESETS: Record<string, string[]> = {
  approved: [
    "Awesome project! The retro aesthetic is spot on.",
    "Approved! Clean commits, great README, and verified no-AI code.",
    "Well-documented code and fun demo to test. Great work!",
    "Creative implementation with authentic manual coding.",
  ],
  changes: [
    "Live demo link does not work or gives 404. Please test and update.",
    "README is missing build/setup instructions for running locally.",
    "Please track more coding hours in Hackatime during the event window.",
    "Please add a repository link with public source code.",
  ],
  rejected: [
    "Does not match Old-Vibe handcrafted guideline (AI autocomplete/scaffolding detected).",
    "Code appears pre-existing or lacks commits during the event window.",
    "Repository is empty or does not contain a working project.",
  ],
};

export function DecisionForm({
  id,
  trackedProjects,
  defaultHours = 0,
  totalTrackedFormatted,
  makerStreak = 0,
  makerName,
  initialDecided = false,
  initialDecision = null,
  initialApprovedMinutes = null,
  initialNote = null,
}: {
  id: string;
  trackedProjects: number;
  defaultHours?: number;
  totalTrackedFormatted?: string;
  makerStreak?: number;
  makerName: string;
  initialDecided?: boolean;
  initialDecision?: string | null;
  initialApprovedMinutes?: number | null;
  initialNote?: string | null;
}) {
  const router = useRouter();
  const ids = useId();

  const [isEditing, setIsEditing] = useState(!initialDecided);
  const [decision, setDecision] = useState<string>(initialDecision ?? "approved");
  const [hours, setHours] = useState(
    initialApprovedMinutes != null
      ? String(Math.round((initialApprovedMinutes / 60) * 10) / 10)
      : defaultHours > 0
        ? String(defaultHours)
        : "",
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [problem, setProblem] = useState<{ field?: string; message: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [clearing, setClearing] = useState(false);

  const errorFor = (field: string) => (problem?.field === field ? problem.message : undefined);

  // Real-time Paper calculation
  const parsedHours = Number(hours) || 0;
  const paperRate = paperRateForStreak(makerStreak);
  const calculatedPaper = parsedHours > 0 ? Math.round(parsedHours * paperRate) : 0;

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
      setIsEditing(false);
      router.refresh();
      setWorking(false);
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { field?: string; message?: string };
    setProblem({ field: body.field, message: body.message ?? "That did not save." });
    setWorking(false);
  }

  async function clearCurrentDecision() {
    setClearing(true);
    setProblem(null);

    const response = await fetch(`/api/admin/ships/${id}/decision`, {
      method: "DELETE",
    });

    setClearing(false);

    if (response.ok) {
      setIsEditing(true);
      router.refresh();
      return;
    }

    setProblem({ message: "Could not clear decision. Please try again." });
  }

  if (!isEditing && initialDecided) {
    const isApproved = initialDecision === "approved";
    const appHours = initialApprovedMinutes ? (initialApprovedMinutes / 60).toFixed(1) : "0";
    const appPaper =
      initialApprovedMinutes && initialApprovedMinutes > 0
        ? Math.round((initialApprovedMinutes / 60) * paperRate)
        : 0;

    return (
      <div className={styles.decidedContainer}>
        <div
          className={[
            styles.decidedStatusBadge,
            isApproved
              ? styles.decidedApproved
              : initialDecision === "changes"
                ? styles.decidedChanges
                : styles.decidedRejected,
          ].join(" ")}
        >
          {isApproved
            ? `APPROVED -- ${appHours}H`
            : initialDecision === "changes"
              ? "CHANGES REQUESTED"
              : "NOT APPROVED"}
        </div>

        {isApproved ? (
          <div className={styles.decidedRewardBox}>
            <span className={styles.decidedRewardLabel}>Paper Credited:</span>
            <span className={styles.decidedRewardValue}>
              +{appPaper} <PaperIcon size={16} />
            </span>
          </div>
        ) : null}

        {initialNote ? (
          <div className={styles.decidedNoteBox}>
            <span className={styles.decidedNoteLabel}>Note to {makerName}:</span>
            <p className={styles.decidedNoteText}>{initialNote}</p>
          </div>
        ) : null}

        <div className={styles.decidedActions}>
          <Button
            variant="quiet"
            onClick={clearCurrentDecision}
            loading={clearing}
            loadingLabel="re-opening…"
          >
            Change Decision / Re-evaluate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      {problem && !problem.field ? <Banner tone="bad">{problem.message}</Banner> : null}

      <div className={styles.decisionPillGroup} role="group" aria-label="decision">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={[
              styles.decisionPill,
              decision === option.key ? styles[`decisionPill_${option.key}`] : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={decision === option.key}
            onClick={() => setDecision(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {decision === "approved" ? (
        <div className={styles.approvalSection}>
          <Field
            id={`${ids}-hours`}
            label="Hours to Approve"
            help={
              defaultHours > 0
                ? `Hackatime audit detected ${totalTrackedFormatted ?? `${defaultHours}h`} eligible time.`
                : `Maker linked ${trackedProjects} Hackatime ${trackedProjects === 1 ? "project" : "projects"}.`
            }
            error={errorFor("approvedHours")}
          >
            <Input
              value={hours}
              inputMode="decimal"
              placeholder={defaultHours > 0 ? String(defaultHours) : "10"}
              onChange={(event) => setHours(event.target.value)}
            />
            {defaultHours > 0 ? (
              <div className={styles.quickHours}>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => setHours(String(defaultHours))}
                >
                  Full: {defaultHours}h
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

          {/* Real-time Paper Calculator Box */}
          <div className={styles.paperCalculatorBox}>
            <div className={styles.calcHeader}>
              <span className={styles.calcTitle}>
                <PaperIcon size={14} /> Paper Reward Preview
              </span>
              <span className={styles.calcRate}>
                {paperRate.toFixed(1)} paper/hr
                {makerStreak > 0 ? ` (+${(makerStreak * 0.1).toFixed(1)} streak)` : ""}
              </span>
            </div>
            <div className={styles.calcTotalRow}>
              <span className={styles.calcTotalText}>
                {parsedHours > 0
                  ? `${parsedHours}h × ${paperRate.toFixed(1)} rate`
                  : "Enter approved hours"}
              </span>
              <span className={styles.calcTotalAmount}>
                {calculatedPaper} <PaperIcon size={18} />
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <Field
        id={`${ids}-note`}
        label="Note to Maker"
        help="Visible to the maker in their dashboard project card."
        error={errorFor("noteToMaker")}
      >
        <Textarea
          value={note}
          placeholder={
            decision === "approved"
              ? "Share what you loved about their project..."
              : "Explain specifically what needs to be changed or why it wasn't approved..."
          }
          rows={3}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className={styles.presets}>
          <span className={styles.presetLabel}>Quick Presets:</span>
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

      <div className={styles.decisionActions}>
        <Button onClick={record} loading={working} loadingLabel="Saving decision…">
          {decision === "approved"
            ? `Approve & Grant ${calculatedPaper} Paper`
            : `Record ${decision === "changes" ? "Changes Requested" : "Not Approved"}`}
        </Button>
        {initialDecided ? (
          <Button variant="quiet" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
