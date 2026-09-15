import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a notice as read by the current member. Idempotent — the unique
 * (noticeId, userId) pair means the first open is the one that counts, so the
 * "read by X of Y" figure on the admin side stays honest.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireApiMember();
    const { id } = await params;

    const notice = await prisma.notice.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!notice) throw new ApiError(404, "That notice could not be found.");

    const existing = await prisma.noticeRead.findUnique({
      where: { noticeId_userId: { noticeId: id, userId: viewer.id } },
      select: { id: true, readAt: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, readAt: existing.readAt });
    }

    const created = await prisma.noticeRead.create({
      data: { noticeId: id, userId: viewer.id },
      select: { readAt: true },
    });

    await recordAudit({
      userId: viewer.id,
      action: "VIEW_NOTICE",
      targetType: "notice",
      targetId: id,
      metadata: { title: notice.title },
    });

    return NextResponse.json({ ok: true, readAt: created.readAt });
  } catch (error) {
    return apiError(error);
  }
}
