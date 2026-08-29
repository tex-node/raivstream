/**
 * Deletes everything the A/B snapshot qualification created, after the
 * reload check has read job X/Y back from a fresh process. Deleting the
 * throwaway StorySequence cascades its scene, audio plan, tracks, cues,
 * versions, and MovieRenderJob/MovieAsset/MovieRenderEvent rows (all
 * onDelete: Cascade from StorySequence). The AudioAsset row is scoped to
 * the project, not the sequence, so it needs an explicit delete.
 *
 * If an r2StorageKey is given, also deletes the real disposable audio
 * object the qualification uploaded to the shared R2 bucket (there is no
 * isolated staging bucket — staging and production share the same R2
 * bucket/credentials, see the qualification report) via a direct
 * DeleteObjectCommand using the app's own R2 credentials, then confirms via
 * a HeadObjectCommand that it's actually gone.
 *
 * Usage: pnpm exec tsx scripts/phase9b2b-ab-snapshot-cleanup.ts <throwawaySequenceId> <assetId> [r2StorageKey]
 */
import { PrismaClient } from '@raivstream/database';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

async function deleteR2Object(key: string): Promise<{ deleted: boolean; confirmedGone: boolean | null }> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME not set — cannot clean up the uploaded R2 fixture object');
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  let confirmedGone: boolean | null = null;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    confirmedGone = false; // still exists — unexpected
  } catch (e: any) {
    const status = e?.$metadata?.httpStatusCode;
    confirmedGone = status === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey';
  }
  return { deleted: true, confirmedGone };
}

async function main() {
  const [sequenceId, assetId, r2StorageKey] = process.argv.slice(2);
  if (!sequenceId || !assetId) throw new Error('Usage: phase9b2b-ab-snapshot-cleanup.ts <throwawaySequenceId> <assetId> [r2StorageKey]');
  const prisma = new PrismaClient();
  try {
    const deletedSequences = await prisma.storySequence.deleteMany({ where: { id: sequenceId } });
    const deletedAssets = await prisma.audioAsset.deleteMany({ where: { id: assetId } });

    let r2: { deleted: boolean; confirmedGone: boolean | null } | null = null;
    if (r2StorageKey) {
      r2 = await deleteR2Object(r2StorageKey);
    }

    console.log(JSON.stringify({
      ok: true,
      deletedSequences: deletedSequences.count,
      deletedAssets: deletedAssets.count,
      r2ObjectDeleted: r2?.deleted ?? null,
      r2ObjectConfirmedGone: r2?.confirmedGone ?? null,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
