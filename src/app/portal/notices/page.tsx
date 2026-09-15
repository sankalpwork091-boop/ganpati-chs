import type { Metadata } from "next";

import { NoticeBoard } from "@/components/NoticeBoard";

export const metadata: Metadata = { title: "Notices" };

export default function NoticesPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Notice board</h1>
        <p className="mt-1 text-sm text-ink-600">
          Notices from the managing committee. Open a notice to read it in full —
          opening it marks it as read.
        </p>
      </header>

      <NoticeBoard />
    </div>
  );
}
