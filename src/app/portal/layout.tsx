import { AccessWatcher } from "@/components/AccessWatcher";
import { Footer } from "@/components/Footer";
import { PortalNav } from "@/components/PortalNav";
import { requireApprovedMemberPage } from "@/lib/guards";

// Every page under /portal is gated and personalised — never prerendered.
export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /login, /terms or /pending as appropriate. Status is read from
  // the database here, on every request, not from the session token.
  const viewer = await requireApprovedMemberPage();

  return (
    <div className="flex min-h-screen flex-col">
      <PortalNav name={viewer.name} email={viewer.email} image={viewer.image} />
      <AccessWatcher />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
      <Footer />
    </div>
  );
}
