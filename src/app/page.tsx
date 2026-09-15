import Link from "next/link";
import {
  ArrowRight,
  Bell,
  FileText,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Footer } from "@/components/Footer";
import { HeroImage } from "@/components/HeroImage";
import { Badge, ButtonLink, formatDate } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { PMC, REDEVELOPMENT_BLURB, SOCIETY } from "@/lib/society";

// Notices change independently of deploys, and the database is reached at
// request time via Secrets Manager, so this page is never prerendered.
export const dynamic = "force-dynamic";

interface PreviewNotice {
  id: string;
  title: string;
  category: string;
  pinned: boolean;
  createdAt: Date;
}

/**
 * Public preview: titles, category and date only. The body and any attachment
 * stay behind the member login.
 */
async function getNoticePreview(): Promise<PreviewNotice[] | null> {
  try {
    return (await prisma.notice.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        pinned: true,
        createdAt: true,
      },
    })) as PreviewNotice[];
  } catch (error) {
    // The homepage must still render if the database is briefly unreachable.
    console.error("[home] Could not load the notice preview:", error);
    return null;
  }
}

const CATEGORY_TONE = {
  URGENT: "danger",
  MEETING: "info",
  GENERAL: "neutral",
} as const;

export default async function HomePage() {
  const notices = await getNoticePreview();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink-900">
              {SOCIETY.shortName}
            </p>
            <p className="truncate text-xs text-ink-500">{SOCIETY.address}</p>
          </div>
          <nav className="flex shrink-0 items-center gap-2">
            <ButtonLink href="/admin/login" variant="ghost" size="sm">
              Admin
            </ButtonLink>
            <ButtonLink href="/login" size="sm">
              Member login
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero ------------------------------------------------------------ */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-2 lg:py-16">
          <div>
            <Badge tone="warning">Redevelopment in progress</Badge>
            <h1 className="mt-4 text-3xl leading-tight font-bold text-balance text-ink-900 sm:text-4xl">
              {SOCIETY.name}
            </h1>
            <p className="mt-2 text-sm text-ink-500">{SOCIETY.address}</p>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
              {REDEVELOPMENT_BLURB}
            </p>
            <p className="mt-3 text-sm text-ink-500">
              Project management by{" "}
              <span className="font-medium text-ink-700">{PMC.name}</span>
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/login">
                Member login
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/admin/login" variant="secondary">
                <Lock className="h-4 w-4" aria-hidden />
                Admin login
              </ButtonLink>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Members sign in with Google. Access is granted by the managing
              committee after verification.
            </p>
          </div>

          <div className="relative aspect-4/5 w-full overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 shadow-sm lg:aspect-3/4">
            <HeroImage priority />
          </div>
        </section>

        {/* Notice board preview -------------------------------------------- */}
        <section className="border-y border-ink-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-12">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-ink-900">
                  <Bell className="h-5 w-5 text-saffron-600" aria-hidden />
                  Notice board
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Latest notices from the managing committee. Sign in to read
                  them in full.
                </p>
              </div>
            </div>

            <div className="mt-6">
              {notices === null ? (
                <p className="card px-5 py-8 text-center text-sm text-ink-500">
                  Notices are temporarily unavailable. Please try again shortly.
                </p>
              ) : notices.length === 0 ? (
                <p className="card px-5 py-8 text-center text-sm text-ink-500">
                  No notices have been posted yet.
                </p>
              ) : (
                <ul className="card divide-y divide-ink-200">
                  {notices.map((notice) => (
                    <li
                      key={notice.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink-900">
                          {notice.title}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {formatDate(notice.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {notice.pinned ? <Badge tone="warning">Pinned</Badge> : null}
                        <Badge
                          tone={
                            CATEGORY_TONE[
                              notice.category as keyof typeof CATEGORY_TONE
                            ] ?? "neutral"
                          }
                        >
                          {notice.category.charAt(0) +
                            notice.category.slice(1).toLowerCase()}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-4 text-sm text-ink-500">
              <Link
                href="/login"
                className="font-medium text-saffron-700 hover:text-saffron-800 hover:underline"
              >
                Sign in
              </Link>{" "}
              to read the full text and any attachments.
            </p>
          </div>
        </section>

        {/* What members get ------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-xl font-bold text-ink-900">
            What members can access
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: FileText,
                title: "Project documents",
                body: "Agreements, approvals, minutes, drawings, monthly reports and weekly site updates — organised by folder and searchable.",
              },
              {
                icon: Bell,
                title: "Notices",
                body: "Every notice from the managing committee in full, with attachments, including meeting notices and urgent updates.",
              },
              {
                icon: ShieldCheck,
                title: "Verified access only",
                body: "Access is approved member by member. Files are never public — every download is issued privately and recorded.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5">
                <Icon className="h-6 w-6 text-saffron-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-saffron-200 bg-saffron-50 px-5 py-4">
            <Users className="h-5 w-5 shrink-0 text-saffron-700" aria-hidden />
            <p className="flex-1 text-sm text-saffron-900">
              New members: sign in with Google, accept the terms, and the
              managing committee will verify your membership before granting
              access.
            </p>
            <ButtonLink href="/login" size="sm">
              Request access
            </ButtonLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
