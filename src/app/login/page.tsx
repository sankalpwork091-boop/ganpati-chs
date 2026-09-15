import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Lock, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/AuthShell";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { ErrorNote } from "@/components/ui";
import { getViewer } from "@/lib/guards";

export const metadata: Metadata = { title: "Member login" };
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  rejected:
    "This account's access request was declined. Please contact the managing committee if you believe this is an error.",
  OAuthAccountNotLinked:
    "This email address is already registered through a different sign-in method.",
  AccessDenied:
    "Sign-in was declined. If you are a society member, please contact the managing committee.",
  Configuration:
    "Sign-in is not configured correctly. Please contact the administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.role === "ADMIN" ? "/admin" : "/portal");

  const params = await searchParams;
  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ??
      "Sign-in could not be completed. Please try again.")
    : null;

  return (
    <AuthShell
      title="Member login"
      subtitle="Sign in with the Google account registered with the society. Your access is granted by the managing committee after your membership is verified."
      footer={
        <div className="space-y-4">
          <p className="text-center text-sm text-ink-500">
            Managing the portal?{" "}
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1 font-medium text-saffron-700 hover:underline"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Admin login
            </Link>
          </p>
          <p className="text-center text-xs text-ink-400">
            <Link href="/" className="hover:text-ink-600 hover:underline">
              Back to the homepage
            </Link>
          </p>
        </div>
      }
    >
      <div className="space-y-5">
        {errorMessage ? <ErrorNote>{errorMessage}</ErrorNote> : null}

        <div className="card p-6">
          <GoogleSignInButton callbackUrl={params.callbackUrl || "/portal"} />

          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            On your first sign-in you will be asked to read and accept the
            portal&apos;s Terms &amp; Conditions before your request is sent to
            the managing committee.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-600">
            We only read your name, email address and profile photo from Google —
            enough for the committee to verify you as a member. We never get
            access to your Google account itself.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
