import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed URL for a notice attachment — same private pipeline as documents. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireApiMember();
    const { id } = await params;

    const notice = await prisma.notice.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        attachmentS3Key: true,
        attachmentName: true,
      },
    });

    if (!notice?.attachmentS3Key) {
      throw new ApiError(404, "That notice has no attachment.");
    }

    const url = await createDownloadUrl(
      notice.attachmentS3Key,
      notice.attachmentName || "attachment",
    );

    await recordAudit({
      userId: viewer.id,
      action: "DOWNLOAD",
      targetType: "notice_attachment",
      targetId: notice.id,
      metadata: { title: notice.title },
    });

    return NextResponse.json(
      { url, fileName: notice.attachmentName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
