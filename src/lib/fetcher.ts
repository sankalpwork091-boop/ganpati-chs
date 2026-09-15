/** Shared SWR fetcher. Turns a non-2xx response into a thrown Error. */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

/**
 * Polling cadence for the portal's live views.
 *
 * The brief calls for new documents, notices and freshly granted access to turn
 * up without a manual refresh. Fifteen seconds is frequent enough to feel
 * immediate while keeping the request volume sane for a society of this size.
 *
 * TODO: swap for WebSockets / AppSync subscriptions if polling ever feels slow.
 */
export const POLL_INTERVAL_MS = 15_000;

/** Options applied to every live list in the portal. */
export const LIVE_SWR_OPTIONS = {
  refreshInterval: POLL_INTERVAL_MS,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  keepPreviousData: true,
} as const;
