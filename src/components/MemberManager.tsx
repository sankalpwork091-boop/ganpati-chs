"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Search, UserCheck, UserX, X } from "lucide-react";

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

type Status = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
type MemberAction = "approve" | "reject" | "revoke" | "reinstate";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "MEMBER" | "COMMITTEE";
  status: Status;
  flatNumber: string | null;
  phone: string | null;
  tcVersionAccepted: number | null;
  tcAcceptedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface MembersResponse {
  members: Member[];
  counts: Partial<Record<Status, number>>;
}

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  REVOKED: "danger",
} as const;

const STATUS_LABEL = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVOKED: "Revoked",
} as const;

const FILTERS: Array<{ value: Status | "ALL"; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ALL", label: "All" },
];

export function MemberManager({
  defaultStatus = "PENDING",
  showFilters = true,
}: {
  defaultStatus?: Status | "ALL";
  showFilters?: boolean;
}) {
  const [status, setStatus] = useState<Status | "ALL">(defaultStatus);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/api/admin/members${qs ? `?${qs}` : ""}`;
  }, [status, query]);

  const { data, error, isLoading, mutate } = useSWR<MembersResponse>(
    url,
    fetcher,
    LIVE_SWR_OPTIONS,
  );

  const members = data?.members ?? [];

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  status === filter.value
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100",
                )}
              >
                {filter.label}
                {data?.counts?.[filter.value as Status] !== undefined &&
                filter.value !== "ALL" ? (
                  <span
                    className={cx(
                      "ml-1.5 text-xs",
                      status === filter.value ? "text-ink-300" : "text-ink-400",
                    )}
                  >
                    {data.counts[filter.value as Status]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative min-w-[14rem] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name, email or flat…"
              aria-label="Search members"
              className="w-full rounded-lg border border-ink-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-saffron-600 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorNote>
          {error instanceof Error ? error.message : "Members could not be loaded."}
        </ErrorNote>
      ) : isLoading && !data ? (
        <SkeletonRows rows={4} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-9 w-9" />}
          title={
            status === "PENDING"
              ? "No requests waiting"
              : "No members match this filter"
          }
          description={
            status === "PENDING"
              ? "New access requests appear here as soon as a member signs in and accepts the terms."
              : undefined
          }
        />
      ) : (
        <ul className="card divide-y divide-ink-200">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onChanged={() => void mutate()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onChanged,
}: {
  member: Member;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<MemberAction | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function act(action: MemberAction) {
    if (
      (action === "revoke" || action === "reject") &&
      !window.confirm(
        action === "revoke"
          ? `Withdraw portal access for ${member.name || member.email}? They will be signed out of the portal within a few seconds.`
          : `Reject the access request from ${member.name || member.email}?`,
      )
    ) {
      return;
    }

    setBusy(action);
    setFailed(null);
    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The change could not be saved.");
      }
      onChanged();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-4">
        {member.image ? (
          // Google avatar — shown so the committee can visually verify the
          // person against their membership records.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full border border-ink-200"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-200 text-sm font-semibold text-ink-600">
            {(member.name || member.email).charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{member.name || "—"}</p>
            <Badge tone={STATUS_TONE[member.status]}>
              {STATUS_LABEL[member.status]}
            </Badge>
            {member.role === "COMMITTEE" ? (
              <Badge tone="info">Committee</Badge>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-sm text-ink-600">{member.email}</p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            <span>Requested {formatDate(member.createdAt)}</span>
            {member.flatNumber ? <span>Flat {member.flatNumber}</span> : null}
            {member.tcAcceptedAt ? (
              <span>
                Terms v{member.tcVersionAccepted} accepted{" "}
                {formatDate(member.tcAcceptedAt)}
              </span>
            ) : (
              <span className="text-saffron-700">Terms not yet accepted</span>
            )}
            {member.approvedAt ? (
              <span>Approved {formatDate(member.approvedAt)}</span>
            ) : null}
          </div>

          {failed ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {failed}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {member.status === "PENDING" ? (
            <>
              <Button size="sm" disabled={busy !== null} onClick={() => act("approve")}>
                {busy === "approve" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => act("reject")}
              >
                {busy === "reject" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-4 w-4" aria-hidden />
                )}
                Reject
              </Button>
            </>
          ) : member.status === "APPROVED" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => act("revoke")}
            >
              {busy === "revoke" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <UserX className="h-4 w-4" aria-hidden />
              )}
              Revoke access
            </Button>
          ) : (
            <Button size="sm" disabled={busy !== null} onClick={() => act("reinstate")}>
              {busy === "reinstate" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <UserCheck className="h-4 w-4" aria-hidden />
              )}
              Grant access
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
