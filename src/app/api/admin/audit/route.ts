import { NextResponse } from "next/server";
import type { AuditAction, Prisma } from "@prisma/client";

import { apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ACTIONS: AuditAction[] = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "TC_ACCEPT",
  "APPROVE",
  "REJECT",
  "REVOKE",
  "REINSTATE",
  "UPLOAD",
  "UPDATE",
  "DELETE",
  "DOWNLOAD",
  "VIEW_NOTICE",
  "POST_NOTICE",
  "UPDATE_NOTICE",
  "DELETE_NOTICE",
];

const PAGE_SIZE = 50;

/** Audit log viewer, filterable by user, action type and date range. */
export async function GET(request: Request) {
  try {
    await requireApiAdmin();

    const { searchParams } = new URL(request.url);
    const actionParam = searchParams.get("action");
    const userId = searchParams.get("userId")?.trim() || null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number(searchParams.get("page") || 1));

    const action = VALID_ACTIONS.includes(actionParam as AuditAction)
      ? (actionParam as AuditAction)
      : null;

    const createdAt: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) {
      // `to` is a date-only value from the filter UI; include the whole day.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const [entries, total, actors] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
      // The filter dropdown only lists accounts that actually appear in the log.
      prisma.user.findMany({
        where: { auditLogs: { some: {} } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
        take: 500,
      }),
    ]);

    return NextResponse.json(
      {
        entries,
        actors,
        total,
        page,
        pageSize: PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
