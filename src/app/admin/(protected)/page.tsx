import type { Metadata } from "next";
import { Bell, FileText, UserCheck } from "lucide-react";

import { AdminStats } from "@/components/AdminStats";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminDashboardPage() {
  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-600">
            Membership, documents and notices for the redevelopment portal.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/approvals" size="sm" variant="secondary">
            <UserCheck className="h-4 w-4" aria-hidden />
            Approvals
          </ButtonLink>
          <ButtonLink href="/admin/documents" size="sm" variant="secondary">
            <FileText className="h-4 w-4" aria-hidden />
            Upload
          </ButtonLink>
          <ButtonLink href="/admin/notices" size="sm">
            <Bell className="h-4 w-4" aria-hidden />
            Post a notice
          </ButtonLink>
        </div>
      </header>

      <AdminStats />
    </div>
  );
}
