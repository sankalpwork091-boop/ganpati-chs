import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AWS_REGION, awsCredentials, requireEnv } from "./env";

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: AWS_REGION,
      credentials: awsCredentials(),
    });
  }
  return client;
}

export function bucketName(): string {
  return requireEnv("AWS_S3_BUCKET_NAME");
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** 2 GB — generous enough for site walkthrough videos. */
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
/** 100 MB for everything else. */
const MAX_DEFAULT_BYTES = 100 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, { ext: string[]; maxBytes: number }> = {
  "application/pdf": { ext: [".pdf"], maxBytes: MAX_DEFAULT_BYTES },
  "image/jpeg": { ext: [".jpg", ".jpeg"], maxBytes: MAX_DEFAULT_BYTES },
  "image/png": { ext: [".png"], maxBytes: MAX_DEFAULT_BYTES },
  "image/webp": { ext: [".webp"], maxBytes: MAX_DEFAULT_BYTES },
  "video/mp4": { ext: [".mp4"], maxBytes: MAX_VIDEO_BYTES },
  "video/quicktime": { ext: [".mov"], maxBytes: MAX_VIDEO_BYTES },
  "application/msword": { ext: [".doc"], maxBytes: MAX_DEFAULT_BYTES },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: [".docx"],
    maxBytes: MAX_DEFAULT_BYTES,
  },
  "application/vnd.ms-excel": { ext: [".xls"], maxBytes: MAX_DEFAULT_BYTES },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: [".xlsx"],
    maxBytes: MAX_DEFAULT_BYTES,
  },
  "application/vnd.ms-powerpoint": { ext: [".ppt"], maxBytes: MAX_DEFAULT_BYTES },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: [".pptx"],
    maxBytes: MAX_DEFAULT_BYTES,
  },
};

export const ACCEPTED_MIME_TYPES = Object.keys(ALLOWED_TYPES);

export const ACCEPTED_EXTENSIONS = Object.values(ALLOWED_TYPES).flatMap(
  (entry) => entry.ext,
);

export function maxBytesForType(contentType: string): number {
  return ALLOWED_TYPES[contentType]?.maxBytes ?? MAX_DEFAULT_BYTES;
}

export interface UploadValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Checks the declared content type, the filename extension, and the declared
 * size. The declared size is only a first gate — after the browser finishes its
 * direct-to-S3 upload the server re-reads the real object with HeadObject, so a
 * client that lies about its size still gets rejected.
 */
export function validateUpload(
  fileName: string,
  contentType: string,
  sizeBytes: number,
): UploadValidationResult {
  const allowed = ALLOWED_TYPES[contentType];
  if (!allowed) {
    return { ok: false, reason: `File type "${contentType}" is not allowed.` };
  }

  const lower = fileName.toLowerCase();
  if (!allowed.ext.some((ext) => lower.endsWith(ext))) {
    return {
      ok: false,
      reason: `Filename extension does not match the declared type ${contentType}.`,
    };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: "File size is missing or invalid." };
  }

  if (sizeBytes > allowed.maxBytes) {
    const limitMb = Math.round(allowed.maxBytes / (1024 * 1024));
    return { ok: false, reason: `File exceeds the ${limitMb} MB limit for this type.` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Strips anything that could produce a surprising S3 key or a path traversal. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || "file";
  return (
    base
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .slice(-120) || "file"
  );
}

/** `documents/<category>/<timestamp>-<random>-<name>` */
export function buildDocumentKey(
  categorySlug: string,
  fileName: string,
): string {
  const safe = sanitizeFileName(fileName);
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `documents/${categorySlug}/${unique}-${safe}`;
}

export function buildNoticeAttachmentKey(fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `notices/${unique}-${safe}`;
}

// ---------------------------------------------------------------------------
// Presigned URLs
// ---------------------------------------------------------------------------

/** Upload window — long enough for a large video on a slow connection. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/** Download window — deliberately short; the URL is a bearer token. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * A presigned PUT the admin's browser uploads to directly, so large files never
 * pass through the serverless function (which has a small body limit).
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

/**
 * A short-lived presigned GET. The bucket blocks all public access, so this is
 * the only way a file is ever reachable — and it is only issued after the
 * caller's approved status has been re-checked against the database.
 */
export async function createDownloadUrl(
  key: string,
  downloadFileName?: string,
  disposition: "attachment" | "inline" = "attachment",
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ...(downloadFileName
        ? {
            ResponseContentDisposition: `${disposition}; filename="${sanitizeFileName(
              downloadFileName,
            )}"`,
          }
        : {}),
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export interface S3ObjectFacts {
  sizeBytes: number;
  contentType: string;
}

/**
 * Reads the object's true size and type back from S3 after upload. This is the
 * authoritative check — the browser's claims are never trusted.
 */
export async function headObject(key: string): Promise<S3ObjectFacts | null> {
  try {
    const result = await s3().send(
      new HeadObjectCommand({ Bucket: bucketName(), Key: key }),
    );
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      contentType: result.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

// ---------------------------------------------------------------------------
// Content verification
// ---------------------------------------------------------------------------

/** Enough bytes for file-type's container-format sniffing (its own recommendation). */
const SIGNATURE_READ_BYTES = 4100;

/** The shared header of every OLE2/Compound File Binary container. */
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Legacy MS Office formats (.doc/.xls/.ppt) are all the same CFB container at
 * the byte level — file-type deliberately doesn't guess further than that
 * (https://github.com/sindresorhus/file-type#supported-file-types). Checking
 * the shared signature directly still rules out a renamed executable/script.
 */
const CFB_CONTENT_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

/** Reads the first `byteLength` bytes of an object — enough to sniff its real type. */
async function readObjectPrefix(
  key: string,
  byteLength: number = SIGNATURE_READ_BYTES,
): Promise<Buffer | null> {
  try {
    const result = await s3().send(
      new GetObjectCommand({
        Bucket: bucketName(),
        Key: key,
        Range: `bytes=0-${byteLength - 1}`,
      }),
    );
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch {
    return null;
  }
}

/**
 * Confirms the object's real bytes match its declared content type, so a
 * spoofed Content-Type header or a renamed extension can't smuggle a
 * different file type past the declared-type checks in `validateUpload`.
 */
export async function verifyFileSignature(
  key: string,
  declaredContentType: string,
): Promise<boolean> {
  const prefix = await readObjectPrefix(key);
  if (!prefix) return false;

  if (CFB_CONTENT_TYPES.has(declaredContentType)) {
    return prefix.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE);
  }

  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(prefix);
  return detected?.mime === declaredContentType;
}

export { formatBytes } from "./formatBytes";
