import { NextResponse } from "next/server";

import { apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Headline numbers for the admin dashboard. */
export async function GET() {
  try {
    await requireApiAdmin();

    const [
      approvedMembers,
      pendingMembers,
      totalDocuments,
      storage,
      activeNotices,
      topDownloads,
    ] = await Promise.all([
      prisma.user.count({
        where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
      }),
      prisma.user.count({ where: { status: "PENDING" } }),
      prisma.document.count(),
      prisma.document.aggregate({ _sum: { fileSizeBytes: true } }),
      prisma.notice.count({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }),
      // Download counts come from the audit log rather than a counter column,
      // so the figure can never drift away from what was actually recorded.
      prisma.auditLog.groupBy({
        by: ["targetId"],
        where: { action: "DOWNLOAD", targetType: "document" },
        _count: { _all: true },
        orderBy: { _count: { targetId: "desc" } },
        take: 5,
      }),
    ]);

    const topIds = topDownloads
      .map((row) => row.targetId)
      .filter((id): id is string => Boolean(id));

    const topDocuments =
      topIds.length > 0
        ? await prisma.document.findMany({
            where: { id: { in: topIds } },
            select: {
              id: true,
              title: true,
              category: { select: { name: true } },
            },
          })
        : [];

    const titleById = new Map(topDocuments.map((doc) => [doc.id, doc]));

    return NextResponse.json(
      {
        approvedMembers,
        pendingMembers,
        totalDocuments,
        storageBytes: storage._sum.fileSizeBytes ?? 0,
        activeNotices,
        mostDownloaded: topDownloads
          .map((row) => {
            const document = row.targetId ? titleById.get(row.targetId) : undefined;
            // Skip entries whose document has since been deleted.
            if (!document) return null;
            return {
              id: document.id,
              title: document.title,
              category: document.category.name,
              downloads: row._count._all,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
