import type { Metadata } from "next";

import { DocumentLibrary } from "@/components/DocumentLibrary";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Documents</h1>
        <p className="mt-1 text-sm text-ink-600">
          Every document published by the managing committee, organised by
          folder. New uploads appear here on their own — there is no need to
          refresh.
        </p>
      </header>

      <DocumentLibrary />

      <p className="mt-8 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs leading-relaxed text-ink-500">
        These documents are confidential to members of the society. Please do not
        forward or publish them outside the society. Downloads are recorded
        against your account.
      </p>
    </div>
  );
}
