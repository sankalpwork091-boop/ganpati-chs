import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { AuthShell } from "@/components/AuthShell";
import { PendingStatusWatcher } from "@/components/PendingStatusWatcher";
import { SignOutButton } from "@/components/SignOutButton";
import { getViewer } from "@/lib/guards";
import { PMC } from "@/lib/society";
import { getActiveTermsVersion } from "@/lib/terms";

export const metadata: Metadata = { title: "Awaiting approval" };
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role === "ADMIN") redirect("/admin");

  // Terms first — a member should never wait for approval they haven't asked for.
  const activeTerms = await getActiveTermsVersion();
  if (activeTerms && viewer.tcVersionAccepted !== activeTerms.version) {
    redirect("/terms");
  }

  if (viewer.status === "APPROVED") redirect("/portal");

  const denied = viewer.status === "REJECTED" || viewer.status === "REVOKED";

  return (
    <AuthShell
      title={denied ? "Access not available" : "Your request has been sent"}
      subtitle={
        denied
          ? undefined
          : "The managing committee has been notified and will verify your membership."
      }
    >
      <div className="space-y-5">
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                denied ? "bg-red-50" : "bg-saffron-50"
              }`}
            >
              {denied ? (
                <XCircle className="h-5 w-5 text-red-600" aria-hidden />
              ) : (
                <Clock className="h-5 w-5 text-saffron-700" aria-hidden />
              )}
            </div>

            <div className="min-w-0">
              <p className="font-semibold text-ink-900">
                {denied
                  ? viewer.status === "REVOKED"
                    ? "Your access has been withdrawn"
                    : "Your request was not approved"
                  : "Waiting for approval"}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                {denied ? (
                  <>
                    Please contact the managing committee or {PMC.shortName} if
                    you believe this is an error, so your membership records can
                    be verified.
                  </>
                ) : (
                  <>
                    Access is granted member by member after the committee
                    confirms your membership. You will receive an email as soon
                    as it is approved, and this page will unlock on its own.
                  </>
                )}
              </p>

              <dl className="mt-4 space-y-1 border-t border-ink-200 pt-4 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-ink-500">Signed in</dt>
                  <dd className="min-w-0 truncate text-ink-800">{viewer.email}</dd>
                </div>
                {viewer.name ? (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-500">Name</dt>
                    <dd className="min-w-0 truncate text-ink-800">{viewer.name}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-ink-500">Terms</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 text-ink-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    Accepted (v{viewer.tcVersionAccepted})
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {!denied ? <PendingStatusWatcher /> : null}

        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </AuthShell>
  );
}
