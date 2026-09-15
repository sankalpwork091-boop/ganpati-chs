"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ScrollText } from "lucide-react";

import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  SkeletonRows,
  formatDateTime,
} from "@/components/ui";
import { fetcher } from "@/lib/fetcher";

type Action =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "TC_ACCEPT"
  | "APPROVE"
  | "REJECT"
  | "REVOKE"
  | "REINSTATE"
  | "UPLOAD"
  | "UPDATE"
  | "DELETE"
  | "DOWNLOAD"
  | "VIEW_NOTICE"
  | "POST_NOTICE"
  | "UPDATE_NOTICE"
  | "DELETE_NOTICE";

interface Entry {
  id: string;
  action: Action;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; role: string } | null;
}

interface Response {
  entries: Entry[];
  actors: Array<{ id: string; name: string | null; email: string }>;
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_LABEL: Record<Action, string> = {
  LOGIN: "Signed in",
  LOGIN_FAILED: "Failed sign-in",
  LOGOUT: "Signed out",
  TC_ACCEPT: "Accepted terms",
  APPROVE: "Approved member",
  REJECT: "Rejected member",
  REVOKE: "Revoked access",
  REINSTATE: "Reinstated access",
  UPLOAD: "Uploaded document",
  UPDATE: "Updated record",
  DELETE: "Deleted document",
  DOWNLOAD: "Downloaded",
  VIEW_NOTICE: "Opened notice",
  POST_NOTICE: "Posted notice",
  UPDATE_NOTICE: "Edited notice",
  DELETE_NOTICE: "Deleted notice",
};

const ACTION_TONE: Partial<Record<Action, "danger" | "success" | "warning" | "info">> = {
  LOGIN_FAILED: "danger",
  REVOKE: "danger",
  REJECT: "danger",
  DELETE: "danger",
  DELETE_NOTICE: "danger",
  APPROVE: "success",
  REINSTATE: "success",
  UPLOAD: "info",
  POST_NOTICE: "info",
};

const FIELD =
  "rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-saffron-600 focus:outline-none";

export function AuditLogViewer() {
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (userId) params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(page));
    return `/api/admin/audit?${params.toString()}`;
  }, [action, userId, from, to, page]);

  // Not polled: an audit log that reshuffles under the reader's cursor while
  // they are working through it is worse than one they refresh deliberately.
  const { data, error, isLoading, mutate } = useSWR<Response>(url, fetcher, {
    keepPreviousData: true,
  });

  function resetTo(update: () => void) {
    update();
    setPage(1);
  }

  const hasFilters = action || userId || from || to;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="filter-action" className="block text-xs font-medium text-ink-700">
            Action
          </label>
          <select
            id="filter-action"
            value={action}
            onChange={(event) => resetTo(() => setAction(event.target.value))}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">All actions</option>
            {(Object.keys(ACTION_LABEL) as Action[]).map((key) => (
              <option key={key} value={key}>
                {ACTION_LABEL[key]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-user" className="block text-xs font-medium text-ink-700">
            User
          </label>
          <select
            id="filter-user"
            value={userId}
            onChange={(event) => resetTo(() => setUserId(event.target.value))}
            className={`mt-1 max-w-[16rem] ${FIELD}`}
          >
            <option value="">Everyone</option>
            {(data?.actors ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name || actor.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-from" className="block text-xs font-medium text-ink-700">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={from}
            onChange={(event) => resetTo(() => setFrom(event.target.value))}
            className={`mt-1 ${FIELD}`}
          />
        </div>

        <div>
          <label htmlFor="filter-to" className="block text-xs font-medium text-ink-700">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={to}
            onChange={(event) => resetTo(() => setTo(event.target.value))}
            className={`mt-1 ${FIELD}`}
          />
        </div>

        <div className="flex gap-2">
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                resetTo(() => {
                  setAction("");
                  setUserId("");
                  setFrom("");
                  setTo("");
                })
              }
            >
              Clear
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorNote>
          {error instanceof Error ? error.message : "The audit log could not be loaded."}
        </ErrorNote>
      ) : isLoading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-9 w-9" />}
          title="No matching activity"
          description="Try widening the filters or clearing the date range."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">Who</th>
                    <th scope="col" className="px-4 py-3 font-medium">Action</th>
                    <th scope="col" className="px-4 py-3 font-medium">Details</th>
                    <th scope="col" className="px-4 py-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {data.entries.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-ink-600">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-ink-900">
                          {entry.user?.name || "—"}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {entry.user?.email || "deleted account"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>
                          {ACTION_LABEL[entry.action]}
                        </Badge>
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs text-ink-600">
                        <MetadataCell entry={entry} />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-400">
                        {entry.ipAddress || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-ink-500">
              {data.total} entries · page {data.page} of {data.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders the most useful field from the entry's metadata blob. */
function MetadataCell({ entry }: { entry: Entry }) {
  const metadata = entry.metadata;
  if (!metadata || typeof metadata !== "object") {
    return <span className="text-ink-400">—</span>;
  }

  const title = metadata.title ?? metadata.email ?? metadata.username;
  const extras: string[] = [];

  if (metadata.category) extras.push(String(metadata.category));
  if (metadata.from && metadata.to) {
    extras.push(`${String(metadata.from)} → ${String(metadata.to)}`);
  }
  if (metadata.reason) extras.push(String(metadata.reason));
  if (metadata.provider) extras.push(String(metadata.provider));

  return (
    <div>
      {title ? (
        <span className="font-medium text-ink-800">{String(title)}</span>
      ) : null}
      {extras.length > 0 ? (
        <span className="block text-ink-500">{extras.join(" · ")}</span>
      ) : null}
      {!title && extras.length === 0 ? (
        <span className="text-ink-400">
          {entry.targetType ? `${entry.targetType} ${entry.targetId ?? ""}` : "—"}
        </span>
      ) : null}
    </div>
  );
}
