"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Textarea } from "@/components/ui/Field";
import { describeSanction, sanctionFor } from "@/lib/ladder";

import styles from "./page.module.css";

export type ViolationEntry = { id: string; kind: string; reason: string; when: string };

const KIND_LABEL: Record<string, string> = {
  temp_ban: "Temporary ban",
  permanent_ban: "Permanent ban",
  lifted: "Ban lifted",
};

export function ViolationForm({
  projectId,
  makerName,
  priorViolations,
  banEnd,
  history,
}: {
  projectId: string;
  makerName: string;
  priorViolations: number;
  /** "permanently" or "until 8 October 2026" while a ban is active, otherwise null. */
  banEnd: string | null;
  history: ViolationEntry[];
}) {
  const router = useRouter();
  const ids = useId();

  const [reason, setReason] = useState("");
  const [fraud, setFraud] = useState(false);
  const [mistake, setMistake] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lifting = banEnd !== null;
  const next = describeSanction(sanctionFor(priorViolations, fraud));
  const reasonOk = reason.trim().length >= 10;

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/ships/${projectId}/violation`, {
        method: lifting ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lifting ? { reason, mistake } : { reason, fraud }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "That did not go through.");
        setConfirming(false);
        return;
      }
      setReason("");
      setFraud(false);
      setMistake(false);
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.violation}>
      {lifting ? (
        <Banner tone="bad" title={`${makerName} is suspended ${banEnd}`}>
          They cannot submit or order. Lift it only if it was applied wrongly or has been resolved.
        </Banner>
      ) : (
        <p className={styles.violationIntro}>
          For breaking the rules: AI-written or pasted code, fake time, double dipping. This is
          separate from rejecting a project. Violations so far: <strong>{priorViolations}</strong>.
        </p>
      )}

      <Field
        id={`${ids}-reason`}
        label={lifting ? "Why is it being lifted?" : "What happened?"}
        help="The maker reads this."
        error={error}
      >
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setConfirming(false);
          }}
          placeholder={
            lifting
              ? "Resolved after the maker explained the commits."
              : "Large blocks of code appear in one go and the maker could not explain them."
          }
        />
      </Field>

      {lifting ? (
        <Checkbox
          checked={mistake}
          onChange={(event) => setMistake(event.target.checked)}
          label="It was a mistake: do not count it towards future bans"
        />
      ) : (
        <Checkbox
          checked={fraud}
          onChange={(event) => {
            setFraud(event.target.checked);
            setConfirming(false);
          }}
          label="Fraud (fake time, bots, stolen work): permanent straight away"
        />
      )}

      {!lifting ? (
        <p className={styles.violationNext}>
          This will give {makerName} <strong>{next}</strong>.
        </p>
      ) : null}

      {confirming ? (
        <div className={styles.violationConfirm}>
          <span>
            {lifting
              ? `Lift the ban on ${makerName}?`
              : `Ban ${makerName}? They see the reason straight away.`}
          </span>
          <Button
            variant={lifting ? "primary" : "danger"}
            loading={working}
            onClick={submit}
            type="button"
          >
            confirm
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)} type="button">
            cancel
          </Button>
        </div>
      ) : (
        <Button
          variant={lifting ? "quiet" : "danger"}
          disabled={!reasonOk}
          onClick={() => setConfirming(true)}
          type="button"
        >
          {lifting ? "lift ban" : "record violation"}
        </Button>
      )}

      {history.length > 0 ? (
        <ul className={styles.violationHistory}>
          {history.map((entry) => (
            <li key={entry.id}>
              <span className={styles.violationKind}>{KIND_LABEL[entry.kind] ?? entry.kind}</span>
              <span className={styles.violationWhen}>{entry.when}</span>
              <span className={styles.violationReason}>{entry.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
