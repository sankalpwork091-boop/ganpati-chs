"use client";

import Link from "next/link";
import useSWR from "swr";
import { Bell, Download, FileText, HardDrive, UserCheck, Users } from "lucide-react";

import { ErrorNote, SkeletonRows, cx } from "@/components/ui";
import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";
import { formatBytes } from "@/lib/formatBytes";

interface StatsResponse {
  approvedMembers: number;
  pendingMembers: number;
  totalDocuments: number;
  storageBytes: number;
  activeNotices: number;
  mostDownloaded: Array<{
    id: string;
    title: string;
    category: string;
    downloads: number;
  }>;
}

export function AdminStats() {
  const { data, error, isLoading } = useSWR<StatsResponse>(
    "/api/admin/stats",
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  if (error) {
    return (
      <ErrorNote>
        {error instanceof Error ? error.message : "Statistics could not be loaded."}
      </ErrorNote>
    );
  }

  if (isLoading && !data) return <SkeletonRows rows={2} />;
  if (!data) return null;

  const tiles = [
    {
      icon: UserCheck,
      label: "Pending approvals",
      value: data.pendingMembers,
      href: "/admin/approvals",
      highlight: data.pendingMembers > 0,
    },
    {
      icon: Users,
      label: "Approved members",
      value: data.approvedMembers,
      href: "/admin/members",
    },
    {
      icon: FileText,
      label: "Documents",
      value: data.totalDocuments,
      href: "/admin/documents",
    },
    {
      icon: Bell,
      label: "Active notices",
      value: data.activeNotices,
      href: "/admin/notices",
    },
    {
      icon: HardDrive,
      label: "Storage used",
      value: formatBytes(data.storageBytes),
      href: "/admin/documents",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map(({ icon: Icon, label, value, href, highlight }) => (
          <Link
            key={label}
            href={href}
            className={cx(
              "card p-5 transition-colors hover:border-ink-300",
              highlight && "border-saffron-300 bg-saffron-50/60",
            )}
          >
            <Icon
              className={cx(
                "h-5 w-5",
                highlight ? "text-saffron-700" : "text-ink-400",
              )}
              aria-hidden
            />
            <p className="mt-3 text-2xl font-bold text-ink-900">{value}</p>
            <p className="mt-0.5 text-xs text-ink-500">{label}</p>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-900">
          <Download className="h-4 w-4 text-ink-400" aria-hidden />
          Most downloaded documents
        </h2>

        {data.mostDownloaded.length === 0 ? (
          <p className="card px-5 py-8 text-center text-sm text-ink-500">
            No downloads have been recorded yet.
          </p>
        ) : (
          <ol className="card divide-y divide-ink-200">
            {data.mostDownloaded.map((document, index) => (
              <li
                key={document.id}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <span className="w-5 shrink-0 text-sm font-semibold text-ink-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {document.title}
                  </p>
                  <p className="truncate text-xs text-ink-500">{document.category}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-700">
                  {document.downloads}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
