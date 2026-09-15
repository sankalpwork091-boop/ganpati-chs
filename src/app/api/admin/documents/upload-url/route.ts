import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  buildDocumentKey,
  buildNoticeAttachmentKey,
  createUploadUrl,
  validateUpload,
} from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  /** Omitted for notice attachments, which are not filed under a category. */
  categoryId: z.string().min(1).optional(),
  purpose: z.enum(["document", "notice-attachment"]).default("document"),
});

/**
 * Step 1 of an upload: validate the file's declared type and size, then hand
 * back a short-lived presigned PUT.
 *
 * The browser uploads straight to S3 so that large site videos never pass
 * through a serverless function. The declared size is only a first gate — step 2
 * (POST /api/admin/documents) re-reads the real object from S3 before any
 * database row is written.
 */
export async function POST(request: Request) {
  try {
    await requireApiAdmin();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "File name, type and size are required.");
    }

    const { fileName, contentType, sizeBytes, categoryId, purpose } = parsed.data;

    const validation = validateUpload(fileName, contentType, sizeBytes);
    if (!validation.ok) throw new ApiError(400, validation.reason!);

    let key: string;

    if (purpose === "notice-attachment") {
      key = buildNoticeAttachmentKey(fileName);
    } else {
      if (!categoryId) throw new ApiError(400, "A folder must be selected.");
      const category = await prisma.documentCategory.findUnique({
        where: { id: categoryId },
        select: { slug: true },
      });
      if (!category) throw new ApiError(400, "That folder does not exist.");
      key = buildDocumentKey(category.slug, fileName);
    }

    const uploadUrl = await createUploadUrl(key, contentType);

    return NextResponse.json(
      { uploadUrl, s3Key: key },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
