/**
 * Shared R2 (Cloudflare) upload helpers.
 * Used by AI generators to permanently store generated images/videos
 * so short-lived provider URLs don't expire before the client loads them.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function getClient() {
  return new S3Client({
    region:   'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
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

  try {
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
  } catch (err) {
    // R2 credentials misconfigured — return source URL so generation still completes
    console.warn('[r2] Upload failed, falling back to source URL:', (err as Error).message);
    return sourceUrl;
  }
}
