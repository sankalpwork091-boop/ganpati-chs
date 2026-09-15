import { Mail, MapPin, Phone } from "lucide-react";

import { PMC, SOCIETY } from "@/lib/society";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-900 text-ink-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            The Society
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{SOCIETY.name}</p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" aria-hidden />
            {SOCIETY.address}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Project Management
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{PMC.name}</p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" aria-hidden />
            {PMC.address}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Contact
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-saffron-400" aria-hidden />
              <a className="hover:text-white" href={`mailto:${PMC.email}`}>
                {PMC.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-saffron-400" aria-hidden />
              <a className="hover:text-white" href={`tel:${PMC.phone.replace(/\s/g, "")}`}>
                {PMC.phone}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SOCIETY.name}. All rights reserved.
          </p>
          <p>
            Documents in this portal are confidential to members of the society.
          </p>
        </div>
      </div>
    </footer>
  );
}
