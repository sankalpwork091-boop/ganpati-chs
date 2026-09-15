"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  Bell,
  FileText,
  LayoutDashboard,
  Menu,
  ScrollText,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { SignOutButton } from "@/components/SignOutButton";
import { cx } from "@/components/ui";
import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";
import { SOCIETY } from "@/lib/society";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/approvals", label: "Approvals", icon: UserCheck, badge: true },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/notices", label: "Notices", icon: Bell },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export function AdminNav({ name }: { name: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Polled so a request arriving while the admin is on another page still
  // shows up as a badge without a refresh.
  const { data } = useSWR<{ pendingMembers: number }>(
    "/api/admin/stats",
    fetcher,
    LIVE_SWR_OPTIONS,
  );
  const pending = data?.pendingMembers ?? 0;

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-900 text-ink-200">
      <div className="mx-auto max-w-7xl px-5">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/admin" className="min-w-0 shrink-0">
            <p className="truncate text-[15px] font-bold text-white">
              {SOCIETY.shortName}
            </p>
            <p className="truncate text-[11px] text-ink-400">Administration</p>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {LINKS.map(({ href, label, icon: Icon, exact, badge }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href, exact)
                    ? "bg-ink-800 text-white"
                    : "text-ink-300 hover:bg-ink-800/60 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {badge && pending > 0 ? (
                  <span className="rounded-full bg-saffron-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {pending}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <span className="max-w-[10rem] truncate text-xs text-ink-400">
              {name || "Administrator"}
            </span>
            <SignOutButton variant="secondary" />
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-ink-800 lg:hidden">
          <nav className="mx-auto max-w-7xl space-y-1 px-5 py-3">
            {LINKS.map(({ href, label, icon: Icon, exact, badge }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  isActive(href, exact)
                    ? "bg-ink-800 text-white"
                    : "text-ink-300 hover:bg-ink-800/60",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {badge && pending > 0 ? (
                  <span className="ml-auto rounded-full bg-saffron-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {pending}
                  </span>
                ) : null}
              </Link>
            ))}
            <div className="flex items-center justify-between border-t border-ink-800 pt-3">
              <span className="truncate text-xs text-ink-400">
                {name || "Administrator"}
              </span>
              <SignOutButton variant="secondary" />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
