import type { Metadata } from "next";

import { AdminNoticeManager } from "@/components/AdminNoticeManager";

export const metadata: Metadata = { title: "Notices" };

export default function AdminNoticesPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Notice board</h1>
        <p className="mt-1 text-sm text-ink-600">
          Post notices to members, pin the important ones, and see how many
          members have opened each notice.
        </p>
      </header>

      <AdminNoticeManager />
    </div>
  );
}
