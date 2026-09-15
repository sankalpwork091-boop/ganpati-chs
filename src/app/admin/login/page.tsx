import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AuthShell } from "@/components/AuthShell";
import { ErrorNote } from "@/components/ui";
import { getViewer } from "@/lib/guards";

export const metadata: Metadata = { title: "Admin login" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer?.role === "ADMIN" && viewer.isAdmin) redirect("/admin");

  const params = await searchParams;

  return (
    <AuthShell
      title="Administrator login"
      subtitle="For the managing committee and the project management consultant."
      footer={
        <p className="text-center text-sm text-ink-500">
          Society member?{" "}
          <Link
            href="/login"
            className="font-medium text-saffron-700 hover:underline"
          >
            Sign in with Google
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        {params.error === "forbidden" ? (
          <ErrorNote>
            That account does not have administrator access. Please sign in with
            an administrator username and password.
          </ErrorNote>
        ) : null}

        <AdminLoginForm />

        <div className="flex items-start gap-3 rounded-lg border border-saffron-200 bg-saffron-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-saffron-700" aria-hidden />
          <p className="text-xs leading-relaxed text-saffron-900">
            Every administrator action — approvals, uploads, deletions and
            notices — is recorded in the audit log against this account.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
