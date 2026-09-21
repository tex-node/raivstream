/**
 * Shared R2 (Cloudflare) upload helpers.
 * Used by AI generators to permanently store generated images/videos
 * so short-lived provider URLs don't expire before the client loads them.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function getClient() {
  const rawEndpoint = process.env.R2_ENDPOINT!;
  // Tolerate a scheme-less endpoint (e.g. "<id>.r2.cloudflarestorage.com") —
  // the SDK requires an absolute URL and otherwise throws ERR_INVALID_URL.
  const endpoint = /^https?:\/\//.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`;
  return new S3Client({
    region:   'auto',
    endpoint,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // Prevent SDK injecting CRC32 checksum headers that R2 rejects on direct PUTs
    requestChecksumCalculation:  'WHEN_REQUIRED',
    responseChecksumValidation:  'WHEN_REQUIRED',
  });
}

/**
 * Re-derives the permanent public CDN URL for an already-stored object from
 * its storage key alone — the same construction `uploadBufferToR2`/
 * `mirrorUrlToR2` return, exposed standalone so a caller holding a persisted
 * `storageKey` (the stable, non-expiring identity) never has to trust a
 * separately-stored `publicUrl` string as the canonical reference. Returns
 * null if R2 isn't configured, exactly like the upload helpers.
 */
export function getPublicUrlForKey(key: string): string | null {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return null;
  return `${publicUrl}/${key}`;
}

/**
 * Upload a raw buffer directly to R2 (used when the provider returns inline data).
 * Returns the permanent public CDN URL, or null if R2 is not configured.
 */
export async function uploadBufferToR2(
  buffer:      Buffer,
  key:         string,
  contentType: string,
): Promise<string | null> {
  const bucket    = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!bucket || !publicUrl) {
    console.warn('[r2] R2 env vars not set — cannot store inline image');
    return null;
  }

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket:      bucket,
        Key:         key,
        Body:        buffer,
        ContentType: contentType,
      }),
    );
    return `${publicUrl}/${key}`;
  } catch (err) {
    console.warn('[r2] Buffer upload failed:', (err as Error).message);
    return null;
  }
}

/**
 * Download a URL and upload its contents to R2.
 * Returns the permanent public CDN URL.
 */
export async function mirrorUrlToR2(
  sourceUrl:   string,
  key:         string,       // e.g. "generated/abc123.jpg"
  contentType: string,       // e.g. "image/jpeg" | "video/mp4"
): Promise<string> {
  const bucket    = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!bucket || !publicUrl) {
    // R2 not configured — fall back to the original URL (dev mode)
    console.warn('[r2] R2 env vars not set — returning source URL as-is');
    return sourceUrl;
  }

  // Fetch the generated file from the provider
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch source URL for R2 mirror (${res.status}): ${sourceUrl}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  await getClient().send(
    new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        buffer,
      ContentType: contentType,
      // Generated assets are public — no ACL needed with R2 public bucket
    }),
  );
  return `${publicUrl}/${key}`;
}

/**
 * Best-effort existence check for an object, via the public CDN URL (HEAD).
 * Returns false when R2 is not configured or the object is missing.
 */
export async function objectExistsInR2(key: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const url = getPublicUrlForKey(key);
  if (!url) return false;
  try {
    const res = await fetchImpl(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Remove an object from R2. Best-effort; never throws. */
export async function removeFromR2(key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    /* best-effort */
  }
}
