import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { MemberStatus, Role } from "@prisma/client";

import { auth } from "./auth";
import { prisma } from "./prisma";
import { getActiveTermsVersion } from "./terms";

export interface Viewer {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  status: MemberStatus;
  tcVersionAccepted: number | null;
  isAdmin: boolean;
}

/**
 * The single source of truth for "who is asking, and are they still allowed?".
 *
 * The session callback already re-reads the user row, but this re-reads it
 * again at the point of use so that a revocation that lands mid-request is
 * still honoured. Status is never trusted from the token.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      status: true,
      tcVersionAccepted: true,
    },
  });

  if (!user) return null;

  return { ...user, isAdmin: sessionUser.isAdmin === true && user.role === "ADMIN" };
}

/** Approved members, committee members and admins may read member content. */
export function canReadMemberContent(viewer: Viewer): boolean {
  if (viewer.role === "ADMIN") return true;
  return viewer.status === "APPROVED";
}

export function isCommittee(viewer: Viewer): boolean {
  return viewer.role === "COMMITTEE" || viewer.role === "ADMIN";
}

// ---------------------------------------------------------------------------
// Page guards — these redirect
// ---------------------------------------------------------------------------

/**
 * Gate for the member portal. Sends the visitor to whichever step of the
 * onboarding they still owe: sign in, accept the current T&C, or wait for
 * approval.
 */
export async function requireApprovedMemberPage(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  if (viewer.role === "ADMIN") return viewer;

  const activeTerms = await getActiveTermsVersion();
  if (activeTerms && viewer.tcVersionAccepted !== activeTerms.version) {
    redirect("/terms");
  }

  if (viewer.status === "PENDING") redirect("/pending");
  if (viewer.status === "REJECTED" || viewer.status === "REVOKED") {
    redirect("/pending?state=denied");
  }

  return viewer;
}

export async function requireAdminPage(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/admin/login");
  if (viewer.role !== "ADMIN" || !viewer.isAdmin) redirect("/admin/login?error=forbidden");
  return viewer;
}

// ---------------------------------------------------------------------------
// API guards — these throw, and the route handler converts to a response
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requireApiViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError(401, "You must be signed in.");
  return viewer;
}

/** Re-checks approved status server-side on every API call — never cached. */
export async function requireApiMember(): Promise<Viewer> {
  const viewer = await requireApiViewer();
  if (!canReadMemberContent(viewer)) {
    throw new ApiError(403, "Your access has not been approved.");
  }
  return viewer;
}

export async function requireApiAdmin(): Promise<Viewer> {
  const viewer = await requireApiViewer();
  if (viewer.role !== "ADMIN" || !viewer.isAdmin) {
    throw new ApiError(403, "Administrator access is required.");
  }
  return viewer;
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api] Unhandled error:", error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
