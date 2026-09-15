import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { notifyNewNotice } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notices with their read counts, for the admin composer and list. */
export async function GET() {
  try {
    await requireApiAdmin();

    const [notices, approvedMemberCount] = await Promise.all([
      prisma.notice.findMany({
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
          createdBy: { select: { name: true, email: true } },
          _count: { select: { reads: true } },
        },
      }),
      prisma.user.count({
        where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
      }),
    ]);

    return NextResponse.json(
      {
        approvedMemberCount,
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
          readCount: notice._count.reads,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(250),
  body: z.string().trim().min(1).max(20000),
  category: z.enum(["URGENT", "GENERAL", "MEETING"]).default("GENERAL"),
  pinned: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
  attachmentS3Key: z.string().max(1024).nullable().optional(),
  attachmentName: z.string().max(255).nullable().optional(),
  attachmentType: z.string().max(200).nullable().optional(),
  notify: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const admin = await requireApiAdmin();

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "A title and notice text are required.");
    }

    const data = parsed.data;

    if (data.attachmentS3Key && !data.attachmentS3Key.startsWith("notices/")) {
      throw new ApiError(400, "Invalid attachment reference.");
    }

    const notice = await prisma.notice.create({
      data: {
        title: data.title,
        body: data.body,
        category: data.category,
        pinned: data.pinned,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        attachmentS3Key: data.attachmentS3Key || null,
        attachmentName: data.attachmentName || null,
        attachmentType: data.attachmentType || null,
        createdById: admin.id,
      },
      select: { id: true, title: true, category: true, createdAt: true },
    });

    await recordAudit({
      userId: admin.id,
      action: "POST_NOTICE",
      targetType: "notice",
      targetId: notice.id,
      metadata: { title: notice.title, category: notice.category },
    });

    if (data.notify) {
      const members = await prisma.user.findMany({
        where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
        select: { email: true },
      });
      notifyNewNotice(
        members.map((member) => member.email),
        notice.title,
        notice.category,
      );
    }

    return NextResponse.json({ notice }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
