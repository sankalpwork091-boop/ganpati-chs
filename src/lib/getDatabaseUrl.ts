import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import { AWS_REGION, awsCredentials } from "./env";

/**
 * Shape of the JSON stored in the RDS-managed secret. AWS writes `username`
 * and `password` always; `host`/`port`/`dbname` are present for secrets created
 * by RDS itself, but we fall back to env vars in case the secret is a manual one.
 */
interface RdsSecret {
  username: string;
  password: string;
  host?: string;
  port?: number | string;
  dbname?: string;
  engine?: string;
}

/**
 * How long a fetched connection string may be reused.
 *
 * Secrets Manager can rotate the master password underneath us, so the built
 * URL is never cached indefinitely. On serverless this mostly means "once per
 * cold start"; on a long-running server it bounds staleness to the TTL.
 */
const CACHE_TTL_MS = Number(process.env.DB_SECRET_CACHE_TTL_MS || 10 * 60 * 1000);

let cached: { url: string; fetchedAt: number } | null = null;
let inFlight: Promise<string> | null = null;

let secretsClient: SecretsManagerClient | null = null;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: AWS_REGION,
      credentials: awsCredentials(),
    });
  }
  return secretsClient;
}

/** Drop the cached URL so the next call re-reads Secrets Manager. */
export function invalidateDatabaseUrlCache(): void {
  cached = null;
  inFlight = null;
}

async function fetchDatabaseUrl(secretArn: string): Promise<string> {
  const client = getSecretsClient();
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error(
      "DB secret has no SecretString — binary secrets are not supported.",
    );
  }

  let secret: RdsSecret;
  try {
    secret = JSON.parse(response.SecretString) as RdsSecret;
  } catch {
    throw new Error("DB secret is not valid JSON.");
  }

  const host = secret.host || process.env.DB_HOST;
  const port = secret.port ?? process.env.DB_PORT ?? 5432;
  const dbname = secret.dbname || process.env.DB_NAME || "ganpatichs";

  if (!secret.username || !secret.password) {
    throw new Error("DB secret is missing username/password.");
  }
  if (!host) {
    throw new Error(
      "DB secret has no host and DB_HOST is not set — cannot build a connection string.",
    );
  }

  // Credentials are percent-encoded: RDS-generated passwords routinely contain
  // characters that are not URL-safe (#, /, ?, @ ...).
  const user = encodeURIComponent(secret.username);
  const password = encodeURIComponent(secret.password);

  // sslmode=require — RDS terminates TLS and the CA is not bundled here, so we
  // encrypt in transit without full chain verification. Tighten to verify-full
  // with the rds-ca bundle once the CA cert is shipped with the deployment.
  return `postgresql://${user}:${password}@${host}:${port}/${dbname}?sslmode=require&connection_limit=5&pool_timeout=20`;
}

/**
 * Returns a Postgres connection string, fetching the credentials from AWS
 * Secrets Manager. The password never lives in the repo or in .env.
 *
 * If `DB_SECRET_ARN` is not set, falls back to a static `DATABASE_URL` so that
 * local development against a plain Postgres container stays possible.
 */
export async function getDatabaseUrl(): Promise<string> {
  const secretArn = process.env.DB_SECRET_ARN;

  if (!secretArn) {
    const staticUrl = process.env.DATABASE_URL;
    if (staticUrl) {
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[db] DB_SECRET_ARN is not set — falling back to a static DATABASE_URL. " +
            "Production should read credentials from Secrets Manager.",
        );
      }
      return staticUrl;
    }
    throw new Error(
      "Neither DB_SECRET_ARN nor DATABASE_URL is set — cannot connect to the database.",
    );
  }

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.url;
  }

  // Collapse concurrent cold-start calls into a single Secrets Manager request.
  if (!inFlight) {
    inFlight = fetchDatabaseUrl(secretArn)
      .then((url) => {
        cached = { url, fetchedAt: Date.now() };
        return url;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}
