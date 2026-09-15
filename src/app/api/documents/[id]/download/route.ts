import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a short-lived presigned S3 URL for one document.
 *
 * This is the only route to a file: the bucket blocks all public access and no
 * raw S3 URL is ever sent to the browser. Approved status is re-checked here,
 * at the moment of download, rather than trusted from the session token.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireApiMember();
    const { id } = await params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        s3Key: true,
        fileType: true,
        originalFileName: true,
        visibleToMembers: true,
        category: { select: { name: true, slug: true, visibleToMembers: true, sensitive: true } },
      },
    });

    if (!document) throw new ApiError(404, "That document could not be found.");

    // Admins may fetch hidden documents (that is how the QA folder is tested);
    // members may not, and get a 404 rather than a 403 so hidden documents
    // cannot be enumerated.
    const hidden = !document.visibleToMembers || !document.category.visibleToMembers;
    if (hidden && viewer.role !== "ADMIN") {
      throw new ApiError(404, "That document could not be found.");
    }

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get("inline") === "1";

    // TODO (nice-to-have): for `document.category.sensitive`, stamp the PDF with
    // the member's name and the download timestamp before signing the URL,
    // rather than serving the stored object directly.

    const url = await createDownloadUrl(
      document.s3Key,
      document.originalFileName,
      inline ? "inline" : "attachment",
    );

    await recordAudit({
      userId: viewer.id,
      action: "DOWNLOAD",
      targetType: "document",
      targetId: document.id,
      metadata: {
        title: document.title,
        category: document.category.name,
        inline,
      },
    });

    return NextResponse.json(
      { url, fileName: document.originalFileName, fileType: document.fileType },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
