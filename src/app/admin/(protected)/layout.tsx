import { AdminNav } from "@/components/AdminNav";
import { requireAdminPage } from "@/lib/guards";

// A route group, so /admin/login sits outside this guard and stays reachable.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminPage();

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <AdminNav name={admin.name} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">{children}</main>
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-4 text-xs text-ink-500">
          Signed in as {admin.email}. Every action on these pages is recorded in
          the audit log.
        </div>
      </footer>
    </div>
  );
}
