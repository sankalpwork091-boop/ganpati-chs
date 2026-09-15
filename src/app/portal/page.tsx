import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bell, FileText, FolderOpen } from "lucide-react";

import { fileVisual } from "@/components/fileIcons";
import { Badge, ButtonLink, cx, formatDate } from "@/components/ui";
import { requireApprovedMemberPage } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { PMC } from "@/lib/society";

export const metadata: Metadata = { title: "Overview" };

export default async function PortalHomePage() {
  const viewer = await requireApprovedMemberPage();

  const visibility = {
    visibleToMembers: true,
    category: { visibleToMembers: true },
  } as const;

  const [documentCount, recentDocuments, noticeCount, unreadCount, recentNotices] =
    await Promise.all([
      prisma.document.count({ where: visibility }),
      prisma.document.findMany({
        where: visibility,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          fileType: true,
          createdAt: true,
          category: { select: { name: true } },
        },
      }),
      prisma.notice.count({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }),
      prisma.notice.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          reads: { none: { userId: viewer.id } },
        },
      }),
      prisma.notice.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 4,
        select: {
          id: true,
          title: true,
          category: true,
          pinned: true,
          createdAt: true,
        },
      }),
    ]);

  const firstName = viewer.name?.split(" ")[0];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink-900">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Redevelopment documents and notices for {PMC.shortName}&apos;s project
          at Ganpati CHS.
        </p>
      </header>

      {/* Stats ------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<FileText className="h-5 w-5 text-saffron-600" />}
          label="Documents available"
          value={documentCount}
          href="/portal/documents"
        />
        <StatCard
          icon={<Bell className="h-5 w-5 text-saffron-600" />}
          label="Active notices"
          value={noticeCount}
          href="/portal/notices"
        />
        <StatCard
          icon={<Bell className="h-5 w-5 text-red-600" />}
          label="Unread notices"
          value={unreadCount}
          href="/portal/notices"
          highlight={unreadCount > 0}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Recent documents ---------------------------------------------- */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Recently added</h2>
            <Link
              href="/portal/documents"
              className="inline-flex items-center gap-1 text-sm font-medium text-saffron-700 hover:underline"
            >
              All documents
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {recentDocuments.length === 0 ? (
            <p className="card px-5 py-8 text-center text-sm text-ink-500">
              No documents have been published yet.
            </p>
          ) : (
            <ul className="card divide-y divide-ink-200">
              {recentDocuments.map((document) => {
                const { Icon, className } = fileVisual(document.fileType);
                return (
                  <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon className={cx("h-5 w-5 shrink-0", className)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {document.title}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {document.category.name} · {formatDate(document.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent notices -------------------------------------------------- */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Latest notices</h2>
            <Link
              href="/portal/notices"
              className="inline-flex items-center gap-1 text-sm font-medium text-saffron-700 hover:underline"
            >
              Notice board
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {recentNotices.length === 0 ? (
            <p className="card px-5 py-8 text-center text-sm text-ink-500">
              No notices have been posted yet.
            </p>
          ) : (
            <ul className="card divide-y divide-ink-200">
              {recentNotices.map((notice) => (
                <li key={notice.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {notice.title}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDate(notice.createdAt)}
                    </p>
                  </div>
                  {notice.category === "URGENT" ? (
                    <Badge tone="danger">Urgent</Badge>
                  ) : notice.category === "MEETING" ? (
                    <Badge tone="info">Meeting</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-white px-5 py-4">
        <FolderOpen className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
        <p className="flex-1 text-sm text-ink-600">
          Looking for a specific agreement, drawing or report? Browse the
          folders or search the whole library by title.
        </p>
        <ButtonLink href="/portal/documents" size="sm" variant="secondary">
          Browse documents
        </ButtonLink>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "card flex items-center gap-4 p-5 transition-colors hover:border-ink-300",
        highlight && "border-saffron-300 bg-saffron-50/50",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-ink-900">{value}</p>
        <p className="truncate text-xs text-ink-500">{label}</p>
      </div>
    </Link>
  );
}
