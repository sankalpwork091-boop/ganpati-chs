import { prisma } from "./prisma";

/**
 * Database-backed login throttling.
 *
 * In-memory counters are useless on Vercel — each serverless invocation may be a
 * fresh process, so an attacker gets a clean slate every request. The attempt
 * ledger lives in Postgres instead.
 */

export interface RateLimitConfig {
  /** Attempts permitted inside the window. */
  maxAttempts: number;
  windowMinutes: number;
}

export const ADMIN_LOGIN_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMinutes: 15,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMinutes: number;
}

/**
 * Counts failed attempts for an identifier (username) and, separately, for the
 * source IP — so neither spraying many usernames from one IP nor hammering one
 * username from many IPs slips through.
 */
export async function checkLoginRateLimit(
  identifier: string,
  ipAddress: string | null,
  config: RateLimitConfig = ADMIN_LOGIN_LIMIT,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - config.windowMinutes * 60 * 1000);

  const orConditions: Array<Record<string, unknown>> = [
    { identifier: identifier.toLowerCase() },
  ];
  if (ipAddress) orConditions.push({ ipAddress });

  const failures = await prisma.loginAttempt.count({
    where: {
      success: false,
      createdAt: { gte: since },
      OR: orConditions,
    },
  });

  const remaining = Math.max(0, config.maxAttempts - failures);
  return {
    allowed: failures < config.maxAttempts,
    remaining,
    retryAfterMinutes: config.windowMinutes,
  };
}

export async function recordLoginAttempt(
  identifier: string,
  ipAddress: string | null,
  success: boolean,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { identifier: identifier.toLowerCase(), ipAddress, success },
    });

    // A successful sign-in clears the identifier's failure history so a member
    // who simply mistyped isn't locked out for the rest of the window.
    if (success) {
      await prisma.loginAttempt.deleteMany({
        where: { identifier: identifier.toLowerCase(), success: false },
      });
    }
  } catch (error) {
    console.error("[rateLimit] Failed to record login attempt:", error);
  }
}

/**
 * Housekeeping for the attempt ledger. Called opportunistically on sign-in;
 * there is no cron in this deployment.
 */
export async function pruneOldLoginAttempts(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch {
    // Non-critical.
  }
}
