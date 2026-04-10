/**
 * Content scanner — automated moderation for uploaded and AI-generated content.
 *
 * Uses OpenAI omni-moderation-latest with image URL input (same key as prompt
 * moderation, free endpoint). Runs fire-and-forget after upload/publish so
 * the user is never blocked waiting for the scan.
 *
 * Decision logic:
 *   APPROVED — no categories flagged
 *   FLAGGED  — any category flagged (sent to human moderation queue)
 *
 * If the scan fails for any reason (no API key, network error, unsupported URL)
 * the video stays PENDING — it will appear in the admin moderation queue for
 * manual review.
 */

import type { PrismaClient } from '@raivstream/database';

interface OpenAIModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

interface OpenAIModerationResponse {
  results: OpenAIModerationResult[];
}

// ─── Core scanner ─────────────────────────────────────────────────────────────

async function scanImageUrl(imageUrl: string): Promise<OpenAIModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Only scan publicly accessible URLs — skip R2 private / localhost
  if (!imageUrl.startsWith('https://')) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }),
      signal: AbortSignal.timeout(15_000), // 15 s — image scans take longer than text
    });

    if (!res.ok) {
      console.warn('[scanner] OpenAI moderation API returned', res.status);
      return null;
    }

    const data = (await res.json()) as OpenAIModerationResponse;
    return data.results[0] ?? null;
  } catch (err) {
    console.warn('[scanner] Image scan failed:', (err as Error).message);
    return null;
  }
}

// ─── Decision helper ──────────────────────────────────────────────────────────

function decideModerationStatus(result: OpenAIModerationResult | null): {
  status: 'APPROVED' | 'FLAGGED' | 'PENDING';
  reason?: string;
  confidence?: number;
} {
  if (!result) {
    // No result (API unavailable / unsupported URL) — leave as PENDING for human review
    return { status: 'PENDING' };
  }

  if (!result.flagged) {
    return { status: 'APPROVED' };
  }

  // Find highest-confidence flagged category for the log reason
  const flaggedCats = Object.entries(result.categories)
    .filter(([, flagged]) => flagged)
    .map(([cat]) => cat);

  const topScore = Math.max(
    ...flaggedCats.map((cat) => result.category_scores[cat] ?? 0)
  );

  return {
    status: 'FLAGGED',
    reason: `Flagged by automated scan: ${flaggedCats.join(', ')}`,
    confidence: topScore,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a video's thumbnail (or output image) and update its moderationStatus.
 * Call fire-and-forget — do NOT await at the call site.
 *
 * @param prisma  — Prisma client instance from tRPC context
 * @param videoId — the Video record to update
 * @param scanUrl — public URL of the thumbnail or output image to scan
 */
export async function scanAndUpdateVideo(
  prisma: PrismaClient,
  videoId: string,
  scanUrl: string,
): Promise<void> {
  try {
    const result = await scanImageUrl(scanUrl);
    const { status, reason, confidence } = decideModerationStatus(result);

    await prisma.$transaction([
      prisma.video.update({
        where: { id: videoId },
        data: { moderationStatus: status },
      }),
      prisma.moderationLog.create({
        data: {
          videoId,
          moderatorId: null,       // automated action
          action:      status === 'APPROVED' ? 'auto_approve' : status === 'FLAGGED' ? 'auto_flag' : 'pending',
          reason:      reason ?? (status === 'APPROVED' ? 'Clean — auto-approved by content scanner' : 'No scan result — pending manual review'),
          automated:   true,
          confidence:  confidence ?? null,
        },
      }),
    ]);

    console.log(`[scanner] Video ${videoId} → ${status}${confidence ? ` (confidence: ${confidence.toFixed(3)})` : ''}`);
  } catch (err) {
    // Never crash the caller — log and move on
    console.error('[scanner] Failed to update moderation status for video', videoId, (err as Error).message);
  }
}
