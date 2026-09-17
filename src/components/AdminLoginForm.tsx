"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button, ErrorNote, Spinner } from "@/components/ui";

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 focus:border-saffron-600 focus:outline-none";

// Auth.js only preserves the `code` for errors that are instances of its own
// CredentialsSignin — see the RateLimitedSignin class in lib/auth.ts. Any
// other failure (wrong password, unknown username) arrives with no code at
// all, and is deliberately shown as one vague message below so the form can't
// be used to probe which usernames exist. Keep this window in sync with
// ADMIN_LOGIN_LIMIT.windowMinutes in lib/rateLimit.ts.
const RATE_LIMIT_WINDOW_MINUTES = 15;

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn("admin-credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(
        result.code === "rate_limited"
          ? `Too many failed attempts. Please try again in about ${RATE_LIMIT_WINDOW_MINUTES} minutes.`
          : "Incorrect username or password.",
      );
      setPassword("");
      setBusy(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div>
        <label htmlFor="username" className="text-sm font-medium text-ink-800">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={username}
          disabled={busy}
          onChange={(event) => setUsername(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-ink-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <Button type="submit" disabled={busy || !username || !password} className="w-full py-3">
        {busy ? <Spinner /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-xs leading-relaxed text-ink-500">
        Administrator accounts are created by the system administrator only.
        Repeated failed attempts are recorded and temporarily blocked.
      </p>
    </form>
  );
}
