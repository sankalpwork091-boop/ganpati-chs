import Link from "next/link";
import type { ReactNode } from "react";

import { SOCIETY } from "@/lib/society";

/** Centred, single-column frame shared by the sign-in, T&C and waiting screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <Link href="/" className="inline-block">
            <p className="text-base font-bold text-ink-900">{SOCIETY.shortName}</p>
            <p className="text-xs text-ink-500">{SOCIETY.address}</p>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-10 sm:py-16">
        <div className={wide ? "w-full max-w-3xl" : "w-full max-w-md"}>
          <h1 className="text-2xl font-bold text-balance text-ink-900">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{subtitle}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-ink-500">
          {SOCIETY.name} · Documents in this portal are confidential to members.
        </div>
      </footer>
    </div>
  );
}
