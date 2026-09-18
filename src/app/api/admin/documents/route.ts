import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { deleteObject, headObject, validateUpload, verifyFileSignature } from "@/lib/s3";
import { notifyNewDocument } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin view of the library — includes hidden documents and the QA folder. */
export async function GET(request: Request) {
  try {
    await requireApiAdmin();

    const { searchParams } = new URL(request.url);
    const categorySlug = searchParams.get("category")?.trim() || null;
    const query = searchParams.get("q")?.trim() || null;

    const where: Prisma.DocumentWhereInput = {
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { originalFileName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [categories, counts, documents] = await Promise.all([
      prisma.documentCategory.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          visibleToMembers: true,
          sensitive: true,
        },
      }),
      prisma.document.groupBy({ by: ["categoryId"], _count: { _all: true } }),
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 400,
        select: {
          id: true,
          title: true,
          description: true,
          fileType: true,
          fileSizeBytes: true,
          originalFileName: true,
          visibleToMembers: true,
          createdAt: true,
          category: { select: { id: true, slug: true, name: true, visibleToMembers: true } },
          uploadedBy: { select: { name: true, email: true } },
        },
      }),
    ]);

    const countByCategory = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );

    return NextResponse.json(
      {
        categories: categories.map((category) => ({
          ...category,
          count: countByCategory.get(category.id) ?? 0,
        })),
        documents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  s3Key: z.string().min(1).max(1024),
  title: z.string().trim().min(1).max(250),
  categoryId: z.string().min(1),
  description: z.string().trim().max(2000).optional().nullable(),
  visibleToMembers: z.boolean().default(true),
  originalFileName: z.string().min(1).max(255),
  /** Suppresses the notification email for bulk backfills. */
  notify: z.boolean().default(true),
});

/**
 * Step 2 of an upload: confirm the object really landed in S3, verify its true
 * size and type, then record it.
 *
 * If the object fails verification it is deleted from the bucket rather than
 * left as an orphan.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireApiAdmin();

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "Title, folder and uploaded file are required.");
    }

    const {
      s3Key,
      title,
      categoryId,
      description,
      visibleToMembers,
      originalFileName,
      notify,
    } = parsed.data;

    // Only accept keys this app generates, so a crafted request can't attach a
    // database row to an arbitrary object elsewhere in the bucket.
    if (!s3Key.startsWith("documents/")) {
      throw new ApiError(400, "Invalid upload reference.");
    }

    const existing = await prisma.document.findUnique({
      where: { s3Key },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "That file has already been recorded.");

    const category = await prisma.documentCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, visibleToMembers: true },
    });
    if (!category) throw new ApiError(400, "That folder does not exist.");

    const facts = await headObject(s3Key);
    if (!facts) {
      throw new ApiError(400, "The upload did not complete. Please try again.");
    }

    // Re-validate against what S3 actually stored, not what the browser claimed.
    const validation = validateUpload(
      originalFileName,
      facts.contentType,
      facts.sizeBytes,
    );
    if (!validation.ok) {
      await deleteObject(s3Key).catch(() => undefined);
      throw new ApiError(400, validation.reason!);
    }

    // Confirm the real bytes match the declared type — a spoofed Content-Type
    // header or a renamed extension both pass every check above on their own.
    const signatureOk = await verifyFileSignature(s3Key, facts.contentType);
    if (!signatureOk) {
      await deleteObject(s3Key).catch(() => undefined);
      throw new ApiError(400, "The file's content does not match its declared type.");
    }

    const document = await prisma.document.create({
      data: {
        title,
        description: description?.trim() || null,
        categoryId,
        s3Key,
        originalFileName,
        fileType: facts.contentType,
        fileSizeBytes: facts.sizeBytes,
        visibleToMembers,
        uploadedById: admin.id,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        visibleToMembers: true,
      },
    });

    await recordAudit({
      userId: admin.id,
      action: "UPLOAD",
      targetType: "document",
      targetId: document.id,
      metadata: {
        title,
        category: category.name,
        sizeBytes: facts.sizeBytes,
        fileType: facts.contentType,
      },
    });

    // Members are only told about documents they can actually see.
    const memberVisible = visibleToMembers && category.visibleToMembers;
    if (notify && memberVisible) {
      const members = await prisma.user.findMany({
        where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
        select: { email: true },
      });
      notifyNewDocument(
        members.map((member) => member.email),
        title,
        category.name,
      );
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
