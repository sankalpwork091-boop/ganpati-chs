"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";

interface MeResponse {
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  role: "MEMBER" | "COMMITTEE" | "ADMIN";
  needsTerms: boolean;
}

/**
 * Runs inside the portal shell and watches for access being withdrawn or the
 * terms being revised, moving the member out of the portal within one poll.
 *
 * This is a UX convenience, not the security control — every API route and page
 * re-checks the database itself, so a member whose access is revoked cannot
 * read anything even if this component never fires.
 */
export function AccessWatcher() {
  const router = useRouter();
  const { data } = useSWR<MeResponse>("/api/me", fetcher, LIVE_SWR_OPTIONS);

  useEffect(() => {
    if (!data || data.role === "ADMIN") return;

    if (data.needsTerms) {
      router.replace("/terms");
      return;
    }
    if (data.status !== "APPROVED") {
      router.replace("/pending");
      router.refresh();
    }
  }, [data, router]);

  return null;
}
