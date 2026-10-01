"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

export function DisconnectButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/hackatime/disconnect", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "That did not work. Try again.");
        setConfirming(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  }

  if (confirming) {
    return (
      <>
        <Button variant="danger" loading={working} onClick={disconnect} type="button">
          yes, disconnect
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)} type="button">
          keep it
        </Button>
      </>
    );
  }

  return (
    <>
      <Button variant="quiet" onClick={() => setConfirming(true)} type="button">
        disconnect
      </Button>
      {error ? (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 14 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
