import type { Metadata } from "next";

import { AdminDocumentManager } from "@/components/AdminDocumentManager";

export const metadata: Metadata = { title: "Documents" };

export default function AdminDocumentsPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Documents</h1>
        <p className="mt-1 text-sm text-ink-600">
          Upload, organise and withdraw documents. Approved members see new
          uploads within a few seconds without refreshing.
        </p>
      </header>

      <AdminDocumentManager />
    </div>
  );
}
