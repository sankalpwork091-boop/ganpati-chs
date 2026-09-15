"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, LayoutDashboard, Menu, Users, X } from "lucide-react";

import { SignOutButton } from "@/components/SignOutButton";
import { cx } from "@/components/ui";
import { SOCIETY } from "@/lib/society";

const LINKS = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/portal/documents", label: "Documents", icon: FileText },
  { href: "/portal/notices", label: "Notices", icon: Bell },
  { href: "/portal/directory", label: "Directory", icon: Users },
];

export function PortalNav({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string;
  image: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/portal" className="min-w-0 shrink-0">
            <p className="truncate text-[15px] font-bold text-ink-900">
              {SOCIETY.shortName}
            </p>
            <p className="truncate text-[11px] text-ink-500">Member portal</p>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href, exact)
                    ? "bg-saffron-50 text-saffron-800"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <div className="flex items-center gap-2">
              {image ? (
                // Google avatars come from a domain we don't want to configure
                // in next/image; a plain img keeps the config surface small.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="h-8 w-8 rounded-full border border-ink-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-600">
                  {(name || email).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="max-w-[9rem]">
                <p className="truncate text-xs font-medium text-ink-800">
                  {name || "Member"}
                </p>
                <p className="truncate text-[11px] text-ink-500">{email}</p>
              </div>
            </div>
            <SignOutButton />
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-ink-200 bg-white md:hidden">
          <nav className="mx-auto max-w-6xl space-y-1 px-5 py-3">
            {LINKS.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  isActive(href, exact)
                    ? "bg-saffron-50 text-saffron-800"
                    : "text-ink-700 hover:bg-ink-100",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
            <div className="flex items-center justify-between border-t border-ink-200 pt-3">
              <p className="min-w-0 truncate text-xs text-ink-500">{email}</p>
              <SignOutButton />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
