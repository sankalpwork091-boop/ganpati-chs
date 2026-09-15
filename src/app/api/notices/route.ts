import { NextResponse } from "next/server";

import { apiError, requireApiMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The full notice board for approved members: body text, attachments, and
 * whether this member has already opened each notice. Polled by the client.
 */
export async function GET(request: Request) {
  try {
    const viewer = await requireApiMember();

    const { searchParams } = new URL(request.url);
    const includeExpired = searchParams.get("includeExpired") === "1";

    const notices = await prisma.notice.findMany({
      where: includeExpired
        ? {}
        : { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        pinned: true,
        expiresAt: true,
        attachmentS3Key: true,
        attachmentName: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        reads: {
          where: { userId: viewer.id },
          select: { readAt: true },
          take: 1,
        },
      },
    });

    return NextResponse.json(
      {
        notices: notices.map((notice) => ({
          id: notice.id,
          title: notice.title,
          body: notice.body,
          category: notice.category,
          pinned: notice.pinned,
          expiresAt: notice.expiresAt,
          hasAttachment: Boolean(notice.attachmentS3Key),
          attachmentName: notice.attachmentName,
          createdAt: notice.createdAt,
          authorName: notice.createdBy.name,
          readAt: notice.reads[0]?.readAt ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
