"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Download, Eye, FolderOpen, Search, X } from "lucide-react";

import { fileVisual, isPreviewable } from "@/components/fileIcons";
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

interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  count: number;
  sensitive: boolean;
}

interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  fileType: string;
  fileSizeBytes: number;
  originalFileName: string;
  createdAt: string;
  categoryName: string;
  categorySlug: string;
  sensitive: boolean;
}

interface DocumentsResponse {
  categories: CategorySummary[];
  documents: DocumentRow[];
  total: number;
}

export function DocumentLibrary() {
  const [category, setCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/api/documents${qs ? `?${qs}` : ""}`;
  }, [category, query]);

  // Polled, so a document the admin uploads shows up here on its own.
  const { data, error, isLoading } = useSWR<DocumentsResponse>(
    url,
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  const categories = data?.categories ?? [];
  const documents = data?.documents ?? [];
  const totalAll = categories.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      {/* Folders ---------------------------------------------------------- */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Folders
        </h2>
        <nav className="mt-2 max-h-[65vh] space-y-0.5 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cx(
              "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              category === null
                ? "bg-saffron-50 font-medium text-saffron-800"
                : "text-ink-700 hover:bg-ink-100",
            )}
          >
            <span>All documents</span>
            <span className="text-xs text-ink-400">{totalAll}</span>
          </button>

          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.slug)}
              className={cx(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                category === item.slug
                  ? "bg-saffron-50 font-medium text-saffron-800"
                  : "text-ink-700 hover:bg-ink-100",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-ink-400">{item.count}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Documents -------------------------------------------------------- */}
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
            placeholder="Search by title, description or folder…"
            aria-label="Search documents"
            className="w-full rounded-lg border border-ink-300 bg-white py-2.5 pr-10 pl-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-saffron-600 focus:outline-none"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-ink-500">
            {isLoading && !data
              ? "Loading…"
              : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
            {category
              ? ` in ${categories.find((item) => item.slug === category)?.name ?? "this folder"}`
              : ""}
            {query ? ` matching “${query}”` : ""}
          </p>
          <p className="text-xs text-ink-400">Newest first</p>
        </div>

        <div className="mt-3">
          {error ? (
            <ErrorNote>
              {error instanceof Error
                ? error.message
                : "Documents could not be loaded."}
            </ErrorNote>
          ) : isLoading && !data ? (
            <SkeletonRows rows={5} />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-9 w-9" />}
              title={query ? "No matching documents" : "This folder is empty"}
              description={
                query
                  ? "Try a different search term, or clear the search to see everything."
                  : "Documents uploaded by the managing committee will appear here automatically."
              }
              action={
                query ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearchInput("")}>
                    Clear search
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="card divide-y divide-ink-200">
              {documents.map((document) => (
                <DocumentRowItem key={document.id} document={document} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function DocumentRowItem({ document: row }: { document: DocumentRow }) {
  const [busy, setBusy] = useState<"download" | "preview" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { Icon, className } = fileVisual(row.fileType);

  async function open(mode: "download" | "preview") {
    setBusy(mode);
    setFailed(null);
    try {
      const response = await fetch(
        `/api/documents/${row.id}/download${mode === "preview" ? "?inline=1" : ""}`,
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The download link could not be created.");
      }
      const { url } = (await response.json()) as { url: string };

      if (mode === "preview") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        // Navigating rather than opening a tab keeps the Content-Disposition
        // header in charge of the filename.
        window.location.href = url;
      }
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-4">
        <Icon className={cx("mt-0.5 h-6 w-6 shrink-0", className)} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-900">{row.title}</p>
          {row.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
              {row.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-500">
            <Badge>{row.categoryName}</Badge>
            <span>{formatDate(row.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>{formatBytes(row.fileSizeBytes)}</span>
          </div>
          {failed ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {failed}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isPreviewable(row.fileType) ? (
            <Button
              variant="ghost"
              size="sm"
              title="Open in a new tab"
              disabled={busy !== null}
              onClick={() => open("preview")}
            >
              {busy === "preview" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
              <span className="sr-only sm:not-sr-only">View</span>
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => open("download")}
          >
            {busy === "download" ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only sm:not-sr-only">Download</span>
          </Button>
        </div>
      </div>
    </li>
  );
}
