"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";
import { Spinner } from "@/components/ui";

interface MeResponse {
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  needsTerms: boolean;
}

/**
 * Polls the member's own status while they sit on the waiting screen, and sends
 * them into the portal the moment the admin approves them — no sign out, no
 * manual refresh.
 */
export function PendingStatusWatcher() {
  const router = useRouter();
  const { data } = useSWR<MeResponse>("/api/me", fetcher, LIVE_SWR_OPTIONS);

  useEffect(() => {
    if (!data) return;
    if (data.needsTerms) {
      router.replace("/terms");
      return;
    }
    if (data.status === "APPROVED") {
      router.replace("/portal");
      router.refresh();
    }
  }, [data, router]);

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-ink-500">
      <Spinner className="h-3 w-3" />
      Checking for an update every few seconds — you can leave this page open.
    </p>
  );
}
