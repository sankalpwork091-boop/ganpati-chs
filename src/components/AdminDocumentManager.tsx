"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, Pencil, Search, Trash2 } from "lucide-react";

import { DocumentUploader } from "@/components/DocumentUploader";
import { fileVisual } from "@/components/fileIcons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  SkeletonRows,
  Spinner,
  cx,
  formatDate,
} from "@/components/ui";
import { LIVE_SWR_OPTIONS, fetcher } from "@/lib/fetcher";
import { formatBytes } from "@/lib/formatBytes";

interface Category {
  id: string;
  slug: string;
  name: string;
  count: number;
  visibleToMembers: boolean;
  sensitive: boolean;
}

interface AdminDocument {
  id: string;
  title: string;
  description: string | null;
  fileType: string;
  fileSizeBytes: number;
  originalFileName: string;
  visibleToMembers: boolean;
  createdAt: string;
  category: { id: string; slug: string; name: string; visibleToMembers: boolean };
  uploadedBy: { name: string | null; email: string };
}

interface Response {
  categories: Category[];
  documents: AdminDocument[];
}

export function AdminDocumentManager() {
  const [category, setCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/api/admin/documents${qs ? `?${qs}` : ""}`;
  }, [category, query]);

  const { data, error, isLoading, mutate } = useSWR<Response>(
    url,
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  const categories = data?.categories ?? [];
  const documents = data?.documents ?? [];

  return (
    <div className="space-y-6">
      <DocumentUploader
        categories={categories.map((item) => ({
          id: item.id,
          name: item.name,
          visibleToMembers: item.visibleToMembers,
        }))}
        onUploaded={() => void mutate()}
      />

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Folders
          </h2>
          <nav className="mt-2 max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={cx(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
                category === null
                  ? "bg-ink-900 font-medium text-white"
                  : "text-ink-700 hover:bg-ink-100",
              )}
            >
              <span>All folders</span>
              <span className="text-xs opacity-70">
                {categories.reduce((sum, item) => sum + item.count, 0)}
              </span>
            </button>

            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.slug)}
                className={cx(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  category === item.slug
                    ? "bg-ink-900 font-medium text-white"
                    : "text-ink-700 hover:bg-ink-100",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.name}
                  {!item.visibleToMembers ? (
                    <EyeOff className="ml-1 inline h-3 w-3 opacity-60" aria-label="Hidden from members" />
                  ) : null}
                </span>
                <span className="shrink-0 text-xs opacity-70">{item.count}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search documents…"
              aria-label="Search documents"
              className="w-full rounded-lg border border-ink-300 bg-white py-2.5 pr-3 pl-10 text-sm focus:border-saffron-600 focus:outline-none"
            />
          </div>

          <div className="mt-4">
            {error ? (
              <ErrorNote>
                {error instanceof Error
                  ? error.message
                  : "Documents could not be loaded."}
              </ErrorNote>
            ) : isLoading && !data ? (
              <SkeletonRows rows={4} />
            ) : documents.length === 0 ? (
              <EmptyState
                title="No documents here yet"
                description="Upload files using the panel above."
              />
            ) : (
              <ul className="card divide-y divide-ink-200">
                {documents.map((document) => (
                  <AdminDocumentRow
                    key={document.id}
                    document={document}
                    categories={categories}
                    onChanged={() => void mutate()}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminDocumentRow({
  document: row,
  categories,
  onChanged,
}: {
  document: AdminDocument;
  categories: Category[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description ?? "");
  const [categoryId, setCategoryId] = useState(row.category.id);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { Icon, className } = fileVisual(row.fileType);

  // A member can only see the file if both the document and its folder are visible.
  const memberVisible = row.visibleToMembers && row.category.visibleToMembers;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(`/api/admin/documents/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        `Delete "${row.title}"? The file is removed from the portal and from S3. Bucket versioning means an administrator can still recover it from AWS.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(`/api/admin/documents/${row.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The document could not be deleted.");
      }
      onChanged();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="bg-ink-50/60 px-4 py-4 sm:px-5">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Description</label>
            <textarea
              value={description}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Folder</label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {failed ? <ErrorNote>{failed}</ErrorNote> : null}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !title.trim()}
              onClick={() =>
                patch({
                  title: title.trim(),
                  description: description.trim() || null,
                  categoryId,
                })
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
                setTitle(row.title);
                setDescription(row.description ?? "");
                setCategoryId(row.category.id);
                setFailed(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-4">
        <Icon className={cx("mt-0.5 h-6 w-6 shrink-0", className)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{row.title}</p>
            {!memberVisible ? <Badge tone="warning">Hidden</Badge> : null}
          </div>

          {row.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
              {row.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-500">
            <Badge>{row.category.name}</Badge>
            <span>{formatDate(row.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>{formatBytes(row.fileSizeBytes)}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{row.originalFileName}</span>
          </div>

          {failed ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {failed}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            title={
              row.visibleToMembers ? "Hide from members" : "Make visible to members"
            }
            onClick={() => patch({ visibleToMembers: !row.visibleToMembers })}
          >
            {row.visibleToMembers ? (
              <Eye className="h-4 w-4" aria-hidden />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">
              {row.visibleToMembers ? "Hide from members" : "Show to members"}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            title="Edit details"
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
    </li>
  );
}
