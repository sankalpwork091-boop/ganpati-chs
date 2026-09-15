import type { Metadata } from "next";

import { MemberManager } from "@/components/MemberManager";

export const metadata: Metadata = { title: "Members" };

export default function MembersPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Members</h1>
        <p className="mt-1 text-sm text-ink-600">
          Everyone who has requested access to the portal. Revoking access takes
          effect on the member&apos;s next request.
        </p>
      </header>

      <MemberManager defaultStatus="APPROVED" />
    </div>
  );
}
