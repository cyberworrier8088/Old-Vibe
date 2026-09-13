"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { Panel, PanelLabel } from "@/components/ui/Panel";
import type { ProjectJournal } from "@/lib/db/schema";

import styles from "./JournalSection.module.css";

export function JournalSection({
  projectId,
  journals,
  isDraft,
}: {
  projectId: string;
  journals: ProjectJournal[];
  isDraft: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const WHEN = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function submitJournal() {
    if (!content.trim()) return;
    setSending(true);

    const res = await fetch(`/api/projects/${projectId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    setSending(false);
    if (res.ok) {
      setContent("");
      router.refresh();
    } else {
      alert("Failed to submit journal");
    }
  }

  return (
    <Panel>
      <PanelLabel>Project Journal</PanelLabel>
      {journals.length > 0 ? (
        <div className={styles.journals}>
          {journals.map((journal) => (
            <div key={journal.id} className={styles.journalEntry}>
              <div className={styles.journalDate}>{WHEN.format(new Date(journal.createdAt))}</div>
              <p className={styles.journalContent}>{journal.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>No journal entries yet.</p>
      )}

      {isDraft ? (
        <div className={styles.form}>
          <Field id="journal-content" label="Add a new entry">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you work on today?"
            />
          </Field>
          <div className={styles.actions}>
            <Button onClick={submitJournal} loading={sending} loadingLabel="adding…">
              add entry
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
