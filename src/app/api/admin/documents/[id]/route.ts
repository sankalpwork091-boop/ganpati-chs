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
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().min(1).optional(),
  visibleToMembers: z.boolean().optional(),
});

/** Edit a document's metadata — the stored file itself is never rewritten. */
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

    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) throw new ApiError(404, "That document could not be found.");

    if (parsed.data.categoryId) {
      const category = await prisma.documentCategory.findUnique({
        where: { id: parsed.data.categoryId },
        select: { id: true },
      });
      if (!category) throw new ApiError(400, "That folder does not exist.");
    }

    const document = await prisma.document.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description?.trim() || null }
          : {}),
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
        ...(parsed.data.visibleToMembers !== undefined
          ? { visibleToMembers: parsed.data.visibleToMembers }
          : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        visibleToMembers: true,
        category: { select: { id: true, name: true } },
      },
    });

    await recordAudit({
      userId: admin.id,
      action: "UPDATE",
      targetType: "document",
      targetId: id,
      metadata: { changes: parsed.data, title: existing.title },
    });

    return NextResponse.json({ document });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Delete a document and its stored file.
 *
 * The database row goes first: an orphaned S3 object is a storage cost, whereas
 * a database row pointing at a missing object is a broken download for every
 * member who clicks it. Bucket versioning means the object remains recoverable
 * by an administrator if a deletion turns out to be a mistake.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireApiAdmin();
    const { id } = await params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        s3Key: true,
        fileSizeBytes: true,
        category: { select: { name: true } },
      },
    });
    if (!document) throw new ApiError(404, "That document could not be found.");

    await prisma.document.delete({ where: { id } });

    let fileDeleted = true;
    try {
      await deleteObject(document.s3Key);
    } catch (error) {
      fileDeleted = false;
      console.error("[admin] Deleted the record but not the S3 object:", error);
    }

    await recordAudit({
      userId: admin.id,
      action: "DELETE",
      targetType: "document",
      targetId: id,
      metadata: {
        title: document.title,
        category: document.category.name,
        s3Key: document.s3Key,
        fileDeleted,
      },
    });

    return NextResponse.json({ ok: true, fileDeleted });
  } catch (error) {
    return apiError(error);
  }
}
