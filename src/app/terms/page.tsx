import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthShell } from "@/components/AuthShell";
import { RichText } from "@/components/RichText";
import { TermsAcceptForm } from "@/components/TermsAcceptForm";
import { InfoNote } from "@/components/ui";
import { getViewer } from "@/lib/guards";
import { getActiveTermsVersion } from "@/lib/terms";

export const metadata: Metadata = { title: "Terms & Conditions" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const terms = await getActiveTermsVersion();

  // Nothing published yet — don't strand the member behind an empty screen.
  if (!terms) redirect(viewer.role === "ADMIN" ? "/admin" : "/portal");

  const alreadyAccepted = viewer.tcVersionAccepted === terms.version;
  const isRevision =
    viewer.tcVersionAccepted !== null && viewer.tcVersionAccepted < terms.version;

  return (
    <AuthShell
      wide
      title={terms.title}
      subtitle={
        alreadyAccepted
          ? `You accepted version ${terms.version} of these terms.`
          : "Please read these terms in full. You must accept them before your access request can be sent to the managing committee."
      }
    >
      <div className="space-y-6">
        {isRevision && !alreadyAccepted ? (
          <InfoNote>
            These terms have been revised since you last accepted them. Please
            read the updated version and accept it to continue.
          </InfoNote>
        ) : null}

        <div className="card max-h-[55vh] overflow-y-auto p-6">
          <RichText
            text={terms.body}
            className="prose-notice text-[15px] text-ink-700"
          />
        </div>

        {alreadyAccepted ? (
          <InfoNote>
            You have already accepted the current terms. Return to the{" "}
            <a className="font-medium underline" href="/portal">
              member portal
            </a>
            .
          </InfoNote>
        ) : (
          <TermsAcceptForm version={terms.version} />
        )}
      </div>
    </AuthShell>
  );
}
