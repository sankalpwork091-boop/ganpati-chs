"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CloudUpload, Trash2, X } from "lucide-react";

import { fileVisual } from "@/components/fileIcons";
import { Button, ErrorNote, Spinner, cx } from "@/components/ui";
import { formatBytes } from "@/lib/formatBytes";

interface Category {
  id: string;
  name: string;
  visibleToMembers: boolean;
}

type ItemState = "queued" | "uploading" | "recording" | "done" | "failed";

interface QueueItem {
  key: string;
  file: File;
  title: string;
  description: string;
  state: ItemState;
  progress: number;
  error?: string;
}

/**
 * Uploads go straight from the browser to S3 with a presigned PUT, so a 300 MB
 * site video never has to fit through a serverless function's request body.
 * Only after S3 confirms the object does the server record it — and it re-reads
 * the object's real size and type before writing the row.
 */
export function DocumentUploader({
  categories,
  onUploaded,
}: {
  categories: Category[];
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [visibleToMembers, setVisibleToMembers] = useState(true);
  const [notify, setNotify] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCategory = categories.find((item) => item.id === categoryId);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions: QueueItem[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      // Default the title to the filename without its extension — almost always
      // what the admin wants, and still editable.
      title: file.name.replace(/\.[^.]+$/, ""),
      description: "",
      state: "queued",
      progress: 0,
    }));
    setQueue((current) => [...current, ...additions]);
    setFormError(null);
  }

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(key: string) {
    setQueue((current) => current.filter((item) => item.key !== key));
  }

  /** Presigned PUT via XHR, because fetch cannot report upload progress. */
  function putToS3(url: string, file: File, onProgress: (pct: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", url);
      request.setRequestHeader("Content-Type", file.type);

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      request.onload = () =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(
              new Error(
                `S3 rejected the upload (${request.status}). Check the bucket's CORS rules.`,
              ),
            );
      request.onerror = () =>
        reject(new Error("The upload failed. Check your connection and the bucket CORS rules."));
      request.onabort = () => reject(new Error("The upload was cancelled."));
      request.send(file);
    });
  }

  async function uploadOne(item: QueueItem) {
    updateItem(item.key, { state: "uploading", progress: 0, error: undefined });

    // 1. Ask the server for a presigned PUT (it validates type and size first).
    const urlResponse = await fetch("/api/admin/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: item.file.name,
        contentType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size,
        categoryId,
        purpose: "document",
      }),
    });

    if (!urlResponse.ok) {
      const data = (await urlResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Could not start the upload.");
    }

    const { uploadUrl, s3Key } = (await urlResponse.json()) as {
      uploadUrl: string;
      s3Key: string;
    };

    // 2. Send the bytes straight to S3.
    await putToS3(uploadUrl, item.file, (pct) =>
      updateItem(item.key, { progress: pct }),
    );

    // 3. Record it — the server verifies the stored object before writing.
    updateItem(item.key, { state: "recording", progress: 100 });

    const createResponse = await fetch("/api/admin/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key,
        title: item.title.trim() || item.file.name,
        categoryId,
        description: item.description.trim() || null,
        visibleToMembers,
        originalFileName: item.file.name,
        notify,
      }),
    });

    if (!createResponse.ok) {
      const data = (await createResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "The file uploaded but could not be recorded.");
    }
  }

  async function startUpload() {
    if (!categoryId) {
      setFormError("Choose a folder before uploading.");
      return;
    }
    const pending = queue.filter(
      (item) => item.state === "queued" || item.state === "failed",
    );
    if (pending.length === 0) {
      setFormError("Add at least one file.");
      return;
    }

    setRunning(true);
    setFormError(null);

    // Sequential rather than parallel: a committee member uploading twenty
    // scans on society wifi gets steadier progress and fewer timeouts.
    for (const item of pending) {
      try {
        await uploadOne(item);
        updateItem(item.key, { state: "done", progress: 100 });
      } catch (cause) {
        updateItem(item.key, {
          state: "failed",
          error: cause instanceof Error ? cause.message : "Upload failed.",
        });
      }
    }

    setRunning(false);
    onUploaded();
  }

  const doneCount = queue.filter((item) => item.state === "done").length;
  const hasPending = queue.some(
    (item) => item.state === "queued" || item.state === "failed",
  );

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-ink-900">Upload documents</h2>
      <p className="mt-1 text-sm text-ink-600">
        Drag files in or browse. PDFs, images, video and Office files are
        accepted.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="text-sm font-medium text-ink-800">
            Folder
          </label>
          <select
            id="category"
            value={categoryId}
            disabled={running}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-saffron-600 focus:outline-none"
          >
            <option value="">Choose a folder…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.visibleToMembers ? "" : " (hidden from members)"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={visibleToMembers}
              disabled={running}
              onChange={(event) => setVisibleToMembers(event.target.checked)}
              className="h-4 w-4 accent-saffron-700"
            />
            Visible to members
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={notify}
              disabled={running}
              onChange={(event) => setNotify(event.target.checked)}
              className="h-4 w-4 accent-saffron-700"
            />
            Email approved members
          </label>
        </div>
      </div>

      {selectedCategory && !selectedCategory.visibleToMembers ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          This folder is hidden from members — useful for verifying that uploads
          work without publishing anything.
        </p>
      ) : null}

      {/* Drop zone ------------------------------------------------------- */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!running) addFiles(event.dataTransfer.files);
        }}
        className={cx(
          "mt-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-saffron-500 bg-saffron-50"
            : "border-ink-300 bg-ink-50/60",
        )}
      >
        <CloudUpload className="mx-auto h-9 w-9 text-ink-400" aria-hidden />
        <p className="mt-3 text-sm text-ink-700">
          Drag files here, or{" "}
          <button
            type="button"
            disabled={running}
            onClick={() => inputRef.current?.click()}
            className="font-medium text-saffron-700 underline hover:text-saffron-800"
          >
            browse your computer
          </button>
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Up to 100 MB per file, 2 GB for video.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {formError ? (
        <div className="mt-4">
          <ErrorNote>{formError}</ErrorNote>
        </div>
      ) : null}

      {/* Queue ------------------------------------------------------------ */}
      {queue.length > 0 ? (
        <>
          <ul className="mt-4 space-y-2">
            {queue.map((item) => {
              const { Icon, className } = fileVisual(item.file.type);
              return (
                <li
                  key={item.key}
                  className="rounded-lg border border-ink-200 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", className)} aria-hidden />

                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={item.title}
                        disabled={running || item.state === "done"}
                        onChange={(event) =>
                          updateItem(item.key, { title: event.target.value })
                        }
                        aria-label={`Title for ${item.file.name}`}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-ink-900 hover:border-ink-200 focus:border-saffron-600 focus:bg-white focus:outline-none"
                      />
                      <input
                        type="text"
                        value={item.description}
                        placeholder="Description (optional)"
                        disabled={running || item.state === "done"}
                        onChange={(event) =>
                          updateItem(item.key, { description: event.target.value })
                        }
                        aria-label={`Description for ${item.file.name}`}
                        className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-ink-600 placeholder:text-ink-400 hover:border-ink-200 focus:border-saffron-600 focus:bg-white focus:outline-none"
                      />
                      <p className="mt-1 px-1 text-xs text-ink-400">
                        {item.file.name} · {formatBytes(item.file.size)}
                      </p>

                      {item.state === "uploading" || item.state === "recording" ? (
                        <div className="mt-2">
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                            <div
                              className="h-full bg-saffron-600 transition-[width]"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-ink-500">
                            {item.state === "recording"
                              ? "Verifying and recording…"
                              : `Uploading… ${item.progress}%`}
                          </p>
                        </div>
                      ) : null}

                      {item.error ? (
                        <p role="alert" className="mt-1.5 px-1 text-xs text-red-600">
                          {item.error}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {item.state === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Uploaded" />
                      ) : item.state === "failed" ? (
                        <AlertCircle className="h-5 w-5 text-red-600" aria-label="Failed" />
                      ) : item.state === "uploading" || item.state === "recording" ? (
                        <Spinner className="h-4 w-4 text-ink-400" />
                      ) : null}

                      {!running && item.state !== "done" ? (
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          aria-label={`Remove ${item.file.name}`}
                          className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={startUpload} disabled={running || !hasPending}>
              {running ? <Spinner /> : <CloudUpload className="h-4 w-4" aria-hidden />}
              {running ? "Uploading…" : `Upload ${queue.filter((i) => i.state === "queued" || i.state === "failed").length} file(s)`}
            </Button>

            {doneCount > 0 && !running ? (
              <Button
                variant="ghost"
                onClick={() => setQueue((current) => current.filter((i) => i.state !== "done"))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Clear {doneCount} completed
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
