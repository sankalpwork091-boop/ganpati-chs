import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(250).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  category: z.enum(["URGENT", "GENERAL", "MEETING"]).optional(),
  pinned: z.boolean().optional(),
  /** null clears the expiry; an ISO string sets it. */
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireApiAdmin();
    const { id } = await params;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Invalid request.");
    if (Object.keys(parsed.data).length === 0) {
      throw new ApiError(400, "Nothing to change.");
    }

    const existing = await prisma.notice.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) throw new ApiError(404, "That notice could not be found.");

    const { expiresAt, ...rest } = parsed.data;

    const notice = await prisma.notice.update({
      where: { id },
      data: {
        ...rest,
        ...(expiresAt !== undefined
          ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
          : {}),
      },
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        pinned: true,
        expiresAt: true,
      },
    });

    await recordAudit({
      userId: admin.id,
      action: "UPDATE_NOTICE",
      targetType: "notice",
      targetId: id,
      metadata: { changes: parsed.data, title: existing.title },
    });

    return NextResponse.json({ notice });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireApiAdmin();
    const { id } = await params;

    const notice = await prisma.notice.findUnique({
      where: { id },
      select: { id: true, title: true, attachmentS3Key: true },
    });
    if (!notice) throw new ApiError(404, "That notice could not be found.");

    // NoticeRead rows cascade with the notice.
    await prisma.notice.delete({ where: { id } });

    if (notice.attachmentS3Key) {
      await deleteObject(notice.attachmentS3Key).catch((error) =>
        console.error("[admin] Could not delete the notice attachment:", error),
      );
    }

    await recordAudit({
      userId: admin.id,
      action: "DELETE_NOTICE",
      targetType: "notice",
      targetId: id,
      metadata: { title: notice.title },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
