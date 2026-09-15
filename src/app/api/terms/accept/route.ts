import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiViewer } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { notifyAdminOfNewRequest } from "@/lib/ses";
import { getActiveTermsVersion } from "@/lib/terms";

export const runtime = "nodejs";

const bodySchema = z.object({ version: z.number().int().positive() });

export async function POST(request: Request) {
  try {
    const viewer = await requireApiViewer();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "A terms version is required.");
    }

    const active = await getActiveTermsVersion();
    if (!active) throw new ApiError(400, "No terms are currently published.");

    // Guard against a stale tab accepting a superseded version.
    if (parsed.data.version !== active.version) {
      throw new ApiError(
        409,
        "These terms have been updated. Please reload the page and read the current version.",
      );
    }

    const alreadyAccepted = viewer.tcVersionAccepted === active.version;
    if (alreadyAccepted) {
      return NextResponse.json({ ok: true, status: viewer.status });
    }

    // First acceptance ever — this is what turns a sign-in into a request the
    // committee sees in the approvals queue.
    const isFirstAcceptance = viewer.tcVersionAccepted === null;

    await prisma.user.update({
      where: { id: viewer.id },
      data: {
        tcVersionAccepted: active.version,
        tcAcceptedAt: new Date(),
      },
    });

    await recordAudit({
      userId: viewer.id,
      action: "TC_ACCEPT",
      targetType: "terms",
      targetId: active.id,
      metadata: { version: active.version },
    });

    if (isFirstAcceptance && viewer.status === "PENDING") {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true },
      });
      notifyAdminOfNewRequest(
        admins.map((admin) => admin.email),
        viewer.name,
        viewer.email,
      );
    }

    return NextResponse.json({ ok: true, status: viewer.status });
  } catch (error) {
    return apiError(error);
  }
}
