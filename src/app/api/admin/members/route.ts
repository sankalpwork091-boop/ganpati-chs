import { NextResponse } from "next/server";
import type { MemberStatus, Prisma } from "@prisma/client";

import { apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: MemberStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REVOKED",
];

/**
 * Member list for the admin dashboard. Polled by the approvals queue, so a
 * request that arrives while the admin is looking at the page shows up on its
 * own.
 */
export async function GET(request: Request) {
  try {
    await requireApiAdmin();

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const query = searchParams.get("q")?.trim();

    const status = VALID_STATUSES.includes(statusParam as MemberStatus)
      ? (statusParam as MemberStatus)
      : null;

    const where: Prisma.UserWhereInput = {
      role: { in: ["MEMBER", "COMMITTEE"] },
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { flatNumber: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [members, counts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 500,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          status: true,
          flatNumber: true,
          phone: true,
          tcVersionAccepted: true,
          tcAcceptedAt: true,
          approvedAt: true,
          createdAt: true,
        },
      }),
      prisma.user.groupBy({
        by: ["status"],
        where: { role: { in: ["MEMBER", "COMMITTEE"] } },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json(
      {
        members,
        counts: Object.fromEntries(
          counts.map((row) => [row.status, row._count._all]),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
