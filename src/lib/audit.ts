import { headers } from "next/headers";
import type { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Best-effort request attribution. Behind Vercel the client IP arrives in
 * x-forwarded-for; the first entry is the original client.
 */
export async function requestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ipAddress =
      forwarded?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      null;
    return { ipAddress, userAgent: headerList.get("user-agent") };
  } catch {
    // Called outside a request scope (scripts, background work).
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Writes an audit entry. Auditing must never break the action being audited, so
 * failures are logged rather than thrown.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ipAddress, userAgent } = await requestContext();
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
        ipAddress,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] Failed to write audit entry:", input.action, error);
  }
}
