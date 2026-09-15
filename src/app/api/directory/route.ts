import { NextResponse } from "next/server";

import { ApiError, apiError, isCommittee, requireApiMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Member directory.
 *
 * Contact details are visible to committee members and admins only; ordinary
 * approved members see names and flat numbers without phone numbers, so the
 * directory is useful without handing every member a contact list to export.
 */
export async function GET() {
  try {
    const viewer = await requireApiMember();
    if (viewer.status !== "APPROVED" && viewer.role !== "ADMIN") {
      throw new ApiError(403, "Your access has not been approved.");
    }

    const showContacts = isCommittee(viewer);

    const members = await prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
      orderBy: [{ flatNumber: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        flatNumber: true,
        role: true,
        ...(showContacts ? { email: true, phone: true } : {}),
      },
    });

    return NextResponse.json(
      { members, showContacts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
