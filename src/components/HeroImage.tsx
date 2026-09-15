import fs from "node:fs";
import path from "node:path";

import Image from "next/image";
import { Building2 } from "lucide-react";

import { HERO_IMAGE } from "@/lib/society";

/**
 * The building render, with a graceful fallback.
 *
 * The render is dropped into `public/images/` outside of source control, so the
 * file may legitimately be absent in a fresh checkout. Rather than shipping a
 * broken image, we check for it at render time and fall back to a styled panel.
 */
function heroExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", HERO_IMAGE));
  } catch {
    return false;
  }
}

export function HeroImage({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  if (!heroExists()) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-ink-800 via-ink-700 to-ink-900 text-center ${className ?? ""}`}
      >
        <Building2 className="h-14 w-14 text-saffron-400/80" aria-hidden />
        <p className="mt-4 px-6 text-sm text-ink-300">
          Building render not found.
          <br />
          {/* Setup step, not an error the member can act on. */}
          <span className="text-xs text-ink-400">
            Add it at public{HERO_IMAGE}
          </span>
        </p>
      </div>
    );
  }

  return (
    <Image
      src={HERO_IMAGE}
      alt="Architectural render of the redeveloped Ganpati CHS building at Sector 19, Nerul"
      fill
      priority={priority}
      sizes="(max-width: 1024px) 100vw, 50vw"
      className={`object-cover ${className ?? ""}`}
    />
  );
}
