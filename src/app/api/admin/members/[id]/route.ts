import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuditAction, MemberStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { ApiError, apiError, requireApiAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  notifyMemberApproved,
  notifyMemberRejected,
  notifyMemberRevoked,
} from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "revoke", "reinstate"]).optional(),
  role: z.enum(["MEMBER", "COMMITTEE"]).optional(),
  flatNumber: z.string().max(40).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

const ACTION_TO_STATUS: Record<string, MemberStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  revoke: "REVOKED",
  reinstate: "APPROVED",
};

const ACTION_TO_AUDIT: Record<string, AuditAction> = {
  approve: "APPROVE",
  reject: "REJECT",
  revoke: "REVOKE",
  reinstate: "REINSTATE",
};

/**
 * Approve, reject, revoke or reinstate a member, and edit their directory
 * details.
 *
 * The status change alone unlocks the portal — because member status is read
 * from the database on every request, the member's next poll lets them in
 * without signing out and back in.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireApiAdmin();
    const { id } = await params;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Invalid request.");

    const { action, role, flatNumber, phone } = parsed.data;
    if (!action && !role && flatNumber === undefined && phone === undefined) {
      throw new ApiError(400, "Nothing to change.");
    }

    const member = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    if (!member) throw new ApiError(404, "That member could not be found.");
    if (member.role === "ADMIN") {
      throw new ApiError(400, "Administrator accounts cannot be changed here.");
    }

    const data: {
      status?: MemberStatus;
      role?: "MEMBER" | "COMMITTEE";
      approvedAt?: Date | null;
      approvedById?: string | null;
      flatNumber?: string | null;
      phone?: string | null;
    } = {};

    if (action) {
      const nextStatus = ACTION_TO_STATUS[action];
      if (member.status === nextStatus && action !== "reinstate") {
        throw new ApiError(409, `This member is already ${nextStatus.toLowerCase()}.`);
      }
      data.status = nextStatus;
      if (nextStatus === "APPROVED") {
        data.approvedAt = new Date();
        data.approvedById = admin.id;
      } else {
        data.approvedAt = null;
        data.approvedById = null;
      }
    }

    if (role) data.role = role;
    if (flatNumber !== undefined) data.flatNumber = flatNumber?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        flatNumber: true,
        phone: true,
        approvedAt: true,
      },
    });

    if (action) {
      await recordAudit({
        userId: admin.id,
        action: ACTION_TO_AUDIT[action],
        targetType: "user",
        targetId: member.id,
        metadata: {
          email: member.email,
          from: member.status,
          to: updated.status,
        },
      });

      // Fire-and-forget; a slow SES call must not hold up the admin's click.
      if (action === "approve" || action === "reinstate") {
        notifyMemberApproved(member.email, member.name);
      } else if (action === "reject") {
        notifyMemberRejected(member.email, member.name);
      } else if (action === "revoke") {
        notifyMemberRevoked(member.email, member.name);
      }
    } else {
      await recordAudit({
        userId: admin.id,
        action: "UPDATE",
        targetType: "user",
        targetId: member.id,
        metadata: { role, flatNumber, phone },
      });
    }

    return NextResponse.json({ member: updated });
  } catch (error) {
    return apiError(error);
  }
}
