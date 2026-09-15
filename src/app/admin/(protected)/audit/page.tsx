import type { Metadata } from "next";

import { AuditLogViewer } from "@/components/AuditLogViewer";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Audit log</h1>
        <p className="mt-1 text-sm text-ink-600">
          Every sign-in, approval, upload, download and notice, recorded against
          the account that performed it.
        </p>
      </header>

      <AuditLogViewer />
    </div>
  );
}
