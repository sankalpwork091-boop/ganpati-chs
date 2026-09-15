/**
 * Centralised environment access.
 *
 * Nothing here holds a default for a secret — every secret must come from the
 * environment (.env.local locally, Vercel project env vars in deployment).
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

/** SES may live in a different region than RDS/S3. */
export const SES_REGION = process.env.SES_REGION || AWS_REGION;

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Explicit AWS credentials.
 *
 * On Vercel there is no instance role, so the dedicated `ganpati-chs-app` IAM
 * user's key pair is supplied via env vars. When running on AWS compute these
 * can be omitted and the SDK's default provider chain (instance role) is used.
 */
export function awsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return {
    accessKeyId,
    secretAccessKey,
    ...(process.env.AWS_SESSION_TOKEN
      ? { sessionToken: process.env.AWS_SESSION_TOKEN }
      : {}),
  };
}
