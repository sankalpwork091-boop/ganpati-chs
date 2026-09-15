import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireApiMember, apiError } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The member document library.
 *
 * Approved status is re-checked against the database on every call, so a
 * revoked member stops receiving results immediately — and this endpoint is
 * polled, so a newly uploaded document appears without a manual refresh.
 */
export async function GET(request: Request) {
  try {
    await requireApiMember();

    const { searchParams } = new URL(request.url);
    const categorySlug = searchParams.get("category")?.trim() || null;
    const query = searchParams.get("q")?.trim() || null;

    // Members never see the hidden QA folder or individually hidden documents.
    const visibility: Prisma.DocumentWhereInput = {
      visibleToMembers: true,
      category: { visibleToMembers: true },
    };

    const where: Prisma.DocumentWhereInput = {
      ...visibility,
      ...(categorySlug ? { category: { slug: categorySlug, visibleToMembers: true } } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { category: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [categories, counts, documents] = await Promise.all([
      prisma.documentCategory.findMany({
        where: { visibleToMembers: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true, sensitive: true },
      }),
      prisma.document.groupBy({
        by: ["categoryId"],
        where: visibility,
        _count: { _all: true },
      }),
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          title: true,
          description: true,
          fileType: true,
          fileSizeBytes: true,
          originalFileName: true,
          createdAt: true,
          category: { select: { slug: true, name: true, sensitive: true } },
        },
      }),
    ]);

    const countBySlug = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );

    return NextResponse.json(
      {
        categories: categories.map((category) => ({
          ...category,
          count: countBySlug.get(category.id) ?? 0,
        })),
        documents: documents.map((document) => ({
          id: document.id,
          title: document.title,
          description: document.description,
          fileType: document.fileType,
          fileSizeBytes: document.fileSizeBytes,
          originalFileName: document.originalFileName,
          createdAt: document.createdAt,
          categoryName: document.category.name,
          categorySlug: document.category.slug,
          sensitive: document.category.sensitive,
        })),
        total: documents.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
