"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Button, Spinner } from "@/components/ui";

export function SignOutButton({
  variant = "ghost",
  size = "sm",
  label = "Sign out",
  className,
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ callbackUrl: "/" });
      }}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <LogOut className="h-4 w-4" aria-hidden />}
      {label}
    </Button>
  );
}
