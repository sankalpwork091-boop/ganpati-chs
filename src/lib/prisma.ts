import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl, invalidateDatabaseUrlCache } from "./getDatabaseUrl";

/**
 * Prisma with a connection string resolved at runtime from Secrets Manager.
 *
 * PrismaClient's constructor is synchronous but our URL is async, so the
 * exported `prisma` is a thin lazy proxy: property access is cheap and
 * synchronous, and the real client is constructed on the first actual query.
 * This keeps every call site — including the Auth.js Prisma adapter, which
 * demands a client instance up front — written as ordinary `prisma.x.y()`.
 */

declare global {
  var __ganpatiPrisma: Promise<PrismaClient> | undefined;
}

/** Prisma error codes that mean "the credentials we connected with are stale". */
const AUTH_ERROR_CODES = new Set(["P1000", "P1010"]);

async function createClient(): Promise<PrismaClient> {
  const url = await getDatabaseUrl();
  return new PrismaClient({
    datasourceUrl: url,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

function clientPromise(): Promise<PrismaClient> {
  // Reused across HMR reloads in dev so we don't exhaust RDS connections.
  if (!globalThis.__ganpatiPrisma) {
    globalThis.__ganpatiPrisma = createClient();
  }
  return globalThis.__ganpatiPrisma;
}

/** Await the underlying client directly (for transactions, raw queries, scripts). */
export function getPrisma(): Promise<PrismaClient> {
  return clientPromise();
}

/**
 * Tear down the cached client and the cached secret. Called when a query fails
 * authentication, which is what a Secrets Manager password rotation looks like
 * from here.
 */
async function resetClient(): Promise<void> {
  const existing = globalThis.__ganpatiPrisma;
  globalThis.__ganpatiPrisma = undefined;
  invalidateDatabaseUrlCache();
  if (existing) {
    try {
      const client = await existing;
      await client.$disconnect();
    } catch {
      // Already broken — nothing useful to do.
    }
  }
}

function isAuthError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    AUTH_ERROR_CODES.has((error as { code: string }).code)
  );
}

/**
 * Run a query, and if it fails because the password rotated, rebuild the client
 * from a fresh secret and try exactly once more.
 */
async function runWithRotationRetry<T>(
  run: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = await clientPromise();
  try {
    return await run(client);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    console.warn("[db] Authentication failed — refetching rotated credentials.");
    await resetClient();
    const fresh = await clientPromise();
    return run(fresh);
  }
}

type AnyClient = Record<string, Record<string, (...args: unknown[]) => unknown>>;

function createLazyPrisma(): PrismaClient {
  const memo = new Map<string, unknown>();

  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      // Never let the proxy look like a thenable — `await prisma` must not hang,
      // and Promise resolution probes for `.then` on returned objects.
      if (property === "then" || typeof property === "symbol") return undefined;

      const key = property as string;
      if (memo.has(key)) return memo.get(key);

      // Top-level client methods: $transaction, $queryRaw, $disconnect, ...
      if (key.startsWith("$")) {
        const method = (...args: unknown[]) =>
          runWithRotationRetry((client) => {
            // Called off the client so `this` stays bound to it.
            const host = client as unknown as Record<
              string,
              (...a: unknown[]) => Promise<unknown>
            >;
            return host[key](...args);
          });
        memo.set(key, method);
        return method;
      }

      // Model delegates: prisma.user.findMany(...), prisma.document.create(...)
      const delegate = new Proxy(
        {},
        {
          get(_d, methodName) {
            if (methodName === "then" || typeof methodName === "symbol") {
              return undefined;
            }
            return (...args: unknown[]) =>
              runWithRotationRetry((client) => {
                // Called off the delegate so `this` stays bound to it.
                const model = (client as unknown as AnyClient)[key];
                return model[methodName as string](...args) as Promise<unknown>;
              });
          },
        },
      );

      memo.set(key, delegate);
      return delegate;
    },
  });
}

export const prisma = createLazyPrisma();
