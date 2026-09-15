"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Pin,
} from "lucide-react";

import { RichText } from "@/components/RichText";
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  SkeletonRows,
  Spinner,
  cx,
  formatDateTime,
} from "@/components/ui";
import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";

interface NoticeRow {
  id: string;
  title: string;
  body: string;
  category: "URGENT" | "GENERAL" | "MEETING";
  pinned: boolean;
  expiresAt: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
  createdAt: string;
  authorName: string | null;
  readAt: string | null;
}

const CATEGORY_TONE = {
  URGENT: "danger",
  MEETING: "info",
  GENERAL: "neutral",
} as const;

const CATEGORY_LABEL = {
  URGENT: "Urgent",
  MEETING: "Meeting",
  GENERAL: "General",
} as const;

export function NoticeBoard() {
  const { data, error, isLoading, mutate } = useSWR<{ notices: NoticeRow[] }>(
    "/api/notices",
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  const notices = data?.notices ?? [];
  const unreadCount = notices.filter((notice) => !notice.readAt).length;

  if (error) {
    return (
      <ErrorNote>
        {error instanceof Error ? error.message : "Notices could not be loaded."}
      </ErrorNote>
    );
  }

  if (isLoading && !data) return <SkeletonRows rows={4} />;

  if (notices.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-9 w-9" />}
        title="No notices yet"
        description="Notices posted by the managing committee will appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 ? (
        <p className="text-sm text-ink-600">
          You have{" "}
          <span className="font-semibold text-ink-900">
            {unreadCount} unread {unreadCount === 1 ? "notice" : "notices"}
          </span>
          .
        </p>
      ) : null}

      <ul className="space-y-3">
        {notices.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            onRead={() => void mutate()}
          />
        ))}
      </ul>
    </div>
  );
}

function NoticeCard({
  notice,
  onRead,
}: {
  notice: NoticeRow;
  onRead: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const unread = !notice.readAt;

  function toggle() {
    const next = !expanded;
    setExpanded(next);

    // Opening a notice is what counts as reading it — this is the figure the
    // admin sees as "read by X of Y".
    if (next && unread) {
      void fetch(`/api/notices/${notice.id}/read`, { method: "POST" })
        .then(() => onRead())
        .catch(() => undefined);
    }
  }

  async function openAttachment() {
    setDownloading(true);
    setAttachmentError(null);
    try {
      const response = await fetch(`/api/notices/${notice.id}/attachment`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The attachment could not be opened.");
      }
      const { url } = (await response.json()) as { url: string };
      window.location.href = url;
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error ? cause.message : "Something went wrong.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li
      className={cx(
        "card overflow-hidden transition-colors",
        unread && "border-saffron-300 bg-saffron-50/40",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink-50/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {notice.pinned ? (
              <Pin className="h-3.5 w-3.5 text-saffron-700" aria-label="Pinned" />
            ) : null}
            <span className="font-semibold text-ink-900">{notice.title}</span>
            {unread ? (
              <span className="h-1.5 w-1.5 rounded-full bg-saffron-600" aria-label="Unread" />
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-500">
            <Badge tone={CATEGORY_TONE[notice.category]}>
              {CATEGORY_LABEL[notice.category]}
            </Badge>
            <span>{formatDateTime(notice.createdAt)}</span>
            {notice.authorName ? <span>· {notice.authorName}</span> : null}
            {notice.hasAttachment ? (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" aria-hidden />
                Attachment
              </span>
            ) : null}
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        ) : (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-ink-200 px-5 py-4">
          <RichText
            text={notice.body}
            className="prose-notice text-[15px] text-ink-700"
          />

          {notice.hasAttachment ? (
            <div className="mt-4">
              <Button variant="secondary" size="sm" disabled={downloading} onClick={openAttachment}>
                {downloading ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Paperclip className="h-4 w-4" aria-hidden />
                )}
                {notice.attachmentName || "Download attachment"}
              </Button>
              {attachmentError ? (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {attachmentError}
                </p>
              ) : null}
            </div>
          ) : null}

          {notice.expiresAt ? (
            <p className="mt-4 text-xs text-ink-400">
              This notice expires on {formatDateTime(notice.expiresAt)}.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
