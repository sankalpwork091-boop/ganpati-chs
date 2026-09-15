import type { Metadata } from "next";

import { MemberManager } from "@/components/MemberManager";

export const metadata: Metadata = { title: "Pending approvals" };

export default function ApprovalsPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Pending approvals</h1>
        <p className="mt-1 text-sm text-ink-600">
          Members who have signed in and accepted the terms, waiting to be
          verified. Approving unlocks the portal for them within a few seconds —
          they do not need to sign in again.
        </p>
      </header>

      <MemberManager defaultStatus="PENDING" showFilters={false} />
    </div>
  );
}
