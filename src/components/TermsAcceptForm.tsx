"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import { Button, ErrorNote, Spinner } from "@/components/ui";

export function TermsAcceptForm({ version }: { version: number }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Could not record your acceptance.");
      }

      // The server decides where they go next — the waiting screen for a new
      // member, the portal for one who was already approved.
      router.replace("/portal");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-300 bg-white px-4 py-4 hover:border-ink-400">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 shrink-0 accent-saffron-700"
        />
        <span className="text-sm leading-relaxed text-ink-800">
          I have read and agree to the Terms &amp; Conditions, and I confirm that
          I am a member of the society or a person authorised by the managing
          committee.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={accept} disabled={!agreed || busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Submitting…" : "Accept and continue"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          Decline and sign out
        </Button>
      </div>

      <p className="text-xs text-ink-500">
        Your acceptance is recorded against version {version} of these terms,
        along with the date and time.
      </p>
    </div>
  );
}
