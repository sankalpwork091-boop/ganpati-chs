"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * Client-side session context.
 *
 * `refetchInterval` is what makes admin approval land without a manual refresh:
 * the session is re-read from the server every 20 seconds, and because the
 * server's session callback reads status straight from the database, a member
 * who has just been approved is unlocked on the next tick.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      refetchInterval={20}
      refetchOnWindowFocus
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
