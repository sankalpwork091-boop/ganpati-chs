"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import {
  Bell,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Send,
  Trash2,
  Users,
  X,
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
import { formatBytes } from "@/lib/formatBytes";

type Category = "URGENT" | "GENERAL" | "MEETING";

interface Notice {
  id: string;
  title: string;
  body: string;
  category: Category;
  pinned: boolean;
  expiresAt: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
  createdAt: string;
  authorName: string | null;
  readCount: number;
}

interface Response {
  notices: Notice[];
  approvedMemberCount: number;
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

const FIELD =
  "mt-1.5 w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-saffron-600 focus:outline-none";

export function AdminNoticeManager() {
  const { data, error, isLoading, mutate } = useSWR<Response>(
    "/api/admin/notices",
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  const notices = data?.notices ?? [];
  const memberCount = data?.approvedMemberCount ?? 0;

  return (
    <div className="space-y-6">
      <NoticeComposer onPosted={() => void mutate()} />

      <section>
        <h2 className="mb-3 font-semibold text-ink-900">Posted notices</h2>

        {error ? (
          <ErrorNote>
            {error instanceof Error ? error.message : "Notices could not be loaded."}
          </ErrorNote>
        ) : isLoading && !data ? (
          <SkeletonRows rows={3} />
        ) : notices.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-9 w-9" />}
            title="No notices posted yet"
            description="Use the composer above to post the first notice."
          />
        ) : (
          <ul className="space-y-3">
            {notices.map((notice) => (
              <AdminNoticeRow
                key={notice.id}
                notice={notice}
                memberCount={memberCount}
                onChanged={() => void mutate()}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function NoticeComposer({ onPosted }: { onPosted: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("GENERAL");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [notify, setNotify] = useState(true);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setCategory("GENERAL");
    setPinned(false);
    setExpiresAt("");
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadAttachment(file: File): Promise<{
    s3Key: string;
    name: string;
    type: string;
  }> {
    const urlResponse = await fetch("/api/admin/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        purpose: "notice-attachment",
      }),
    });

    if (!urlResponse.ok) {
      const data = (await urlResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "The attachment could not be prepared.");
    }

    const { uploadUrl, s3Key } = (await urlResponse.json()) as {
      uploadUrl: string;
      s3Key: string;
    };

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error(
        "S3 rejected the attachment upload. Check the bucket's CORS rules.",
      );
    }

    return { s3Key, name: file.name, type: file.type };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    setPosted(false);

    try {
      const uploaded = attachment ? await uploadAttachment(attachment) : null;

      const response = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          pinned,
          // datetime-local gives a local wall-clock string; convert to an
          // absolute instant before sending.
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          attachmentS3Key: uploaded?.s3Key ?? null,
          attachmentName: uploaded?.name ?? null,
          attachmentType: uploaded?.type ?? null,
          notify,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The notice could not be posted.");
      }

      reset();
      setPosted(true);
      onPosted();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="font-semibold text-ink-900">Post a notice</h2>
      <p className="mt-1 text-sm text-ink-600">
        Appears on the member notice board immediately. Titles are also shown on
        the public homepage — the text and attachment are not.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="notice-title" className="text-sm font-medium text-ink-800">
            Title
          </label>
          <input
            id="notice-title"
            type="text"
            required
            maxLength={250}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="notice-body" className="text-sm font-medium text-ink-800">
            Notice text
          </label>
          <textarea
            id="notice-body"
            required
            rows={6}
            maxLength={20000}
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            className={FIELD}
          />
          <p className="mt-1 text-xs text-ink-500">
            Leave a blank line between paragraphs. Wrap text in **double
            asterisks** to make it bold.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="notice-category" className="text-sm font-medium text-ink-800">
              Category
            </label>
            <select
              id="notice-category"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value as Category)}
              className={FIELD}
            >
              <option value="GENERAL">General</option>
              <option value="MEETING">Meeting</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div>
            <label htmlFor="notice-expiry" className="text-sm font-medium text-ink-800">
              Expires (optional)
            </label>
            <input
              id="notice-expiry"
              type="datetime-local"
              value={expiresAt}
              disabled={busy}
              onChange={(event) => setExpiresAt(event.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-ink-800">
            Attachment (optional)
          </span>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              disabled={busy}
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
              className="text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
            />
            {attachment ? (
              <span className="inline-flex items-center gap-2 text-xs text-ink-500">
                {formatBytes(attachment.size)}
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  aria-label="Remove attachment"
                  className="rounded p-0.5 text-ink-400 hover:text-ink-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={pinned}
              disabled={busy}
              onChange={(event) => setPinned(event.target.checked)}
              className="h-4 w-4 accent-saffron-700"
            />
            Pin to the top
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={notify}
              disabled={busy}
              onChange={(event) => setNotify(event.target.checked)}
              className="h-4 w-4 accent-saffron-700"
            />
            Email approved members
          </label>
        </div>

        {failed ? <ErrorNote>{failed}</ErrorNote> : null}
        {posted ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Notice posted. Members will see it within a few seconds.
          </p>
        ) : null}

        <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
          {busy ? <Spinner /> : <Send className="h-4 w-4" aria-hidden />}
          {busy ? "Posting…" : "Post notice"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Existing notices
// ---------------------------------------------------------------------------

function AdminNoticeRow({
  notice,
  memberCount,
  onChanged,
}: {
  notice: Notice;
  memberCount: number;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(notice.title);
  const [body, setBody] = useState(notice.body);
  const [category, setCategory] = useState<Category>(notice.category);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const expired = notice.expiresAt && new Date(notice.expiresAt) < new Date();

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(`/api/admin/notices/${notice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The change could not be saved.");
      }
      setEditing(false);
      onChanged();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete the notice "${notice.title}"? This also removes its read records and attachment.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(`/api/admin/notices/${notice.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The notice could not be deleted.");
      }
      onChanged();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <li className={cx("card p-5", expired && "opacity-70")}>
      {editing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Notice title"
            className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium focus:border-saffron-600 focus:outline-none"
          />
          <textarea
            value={body}
            rows={6}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Notice text"
            className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            aria-label="Notice category"
            className="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none"
          >
            <option value="GENERAL">General</option>
            <option value="MEETING">Meeting</option>
            <option value="URGENT">Urgent</option>
          </select>

          {failed ? <ErrorNote>{failed}</ErrorNote> : null}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !title.trim() || !body.trim()}
              onClick={() =>
                patch({ title: title.trim(), body: body.trim(), category })
              }
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              Save changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setTitle(notice.title);
                setBody(notice.body);
                setCategory(notice.category);
                setFailed(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {notice.pinned ? (
                  <Pin className="h-3.5 w-3.5 text-saffron-700" aria-label="Pinned" />
                ) : null}
                <h3 className="font-semibold text-ink-900">{notice.title}</h3>
                <Badge tone={CATEGORY_TONE[notice.category]}>
                  {CATEGORY_LABEL[notice.category]}
                </Badge>
                {expired ? <Badge tone="neutral">Expired</Badge> : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                <span>{formatDateTime(notice.createdAt)}</span>
                {notice.authorName ? <span>· {notice.authorName}</span> : null}
                {notice.hasAttachment ? (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3 w-3" aria-hidden />
                    {notice.attachmentName}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                title={notice.pinned ? "Unpin" : "Pin to top"}
                onClick={() => patch({ pinned: !notice.pinned })}
              >
                {notice.pinned ? (
                  <PinOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Pin className="h-4 w-4" aria-hidden />
                )}
                <span className="sr-only">{notice.pinned ? "Unpin" : "Pin"}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                title="Edit"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                <span className="sr-only">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                title="Delete"
                onClick={remove}
                className="text-red-600 hover:bg-red-50"
              >
                {busy ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>

          <RichText
            text={notice.body}
            className="prose-notice mt-3 border-t border-ink-200 pt-3 text-sm text-ink-700"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3 text-xs text-ink-500">
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span>
              Read by <span className="font-semibold text-ink-700">{notice.readCount}</span>{" "}
              of {memberCount} approved {memberCount === 1 ? "member" : "members"}
            </span>
            {notice.expiresAt ? (
              <span className="ml-auto">
                {expired ? "Expired" : "Expires"} {formatDateTime(notice.expiresAt)}
              </span>
            ) : null}
          </div>

          {failed ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {failed}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}
