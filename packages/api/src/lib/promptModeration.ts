/**
 * Prompt moderation — runs before any AI generation job is submitted.
 *
 * Layer 1: Built-in keyword/pattern blocklist (always active, zero latency)
 * Layer 2: OpenAI Moderation API (active when OPENAI_API_KEY is set — free endpoint)
 *
 * Call `moderatePrompt(prompt)` which returns:
 *   { allowed: true }                        — prompt is clean
 *   { allowed: false, reason: string }       — prompt is blocked + reason shown to user
 */

// ─── Layer 1: Built-in blocklist ────────────────────────────────────────────
// Patterns that are always blocked regardless of external API availability.
// Keep these broad enough to catch obvious violations without over-blocking.

const BLOCKED_PATTERNS: RegExp[] = [
  // CSAM / minors in sexual context — absolute zero tolerance
  /\b(child|minor|underage|teen|teenager|kid|loli|shota|infant|baby|toddler)\b.{0,40}\b(nude|naked|sex|porn|erotic|explicit|nsfw|genitals?)\b/i,
  /\b(nude|naked|sex|porn|erotic|explicit|nsfw)\b.{0,40}\b(child|minor|underage|teen|teenager|kid|loli|shota)\b/i,

  // Extreme gore / graphic violence
  /\b(decapitat|dismember|eviscerat|disembowel|snuff\s+film|gore)\b/i,

  // Non-consensual sexual content
  /\b(rape|non-?con(sensual)?|sexual\s+assault)\b.{0,30}\b(video|image|scene|depict)\b/i,
];

function checkBlocklist(prompt: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(prompt)) {
      return 'Your prompt contains content that violates our community guidelines and cannot be used for generation.';
    }
  }
  return null;
}

// ─── Layer 2: OpenAI Moderation API ─────────────────────────────────────────
// https://platform.openai.com/docs/api-reference/moderations
// This endpoint is FREE — no usage cost — and requires an OPENAI_API_KEY.

interface OpenAIModerationResponse {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

// Category → user-friendly label for the rejection message
const CATEGORY_LABELS: Record<string, string> = {
  sexual:                    'sexual content',
  'sexual/minors':           'sexual content involving minors',
  violence:                  'graphic violence',
  'violence/graphic':        'graphic violence',
  harassment:                'harassment or hate speech',
  'harassment/threatening':  'threatening content',
  'hate/threatening':        'threatening hate speech',
  'self-harm':               'self-harm content',
  'self-harm/intent':        'self-harm intent',
  'self-harm/instructions':  'self-harm instructions',
  illicit:                   'illicit activity',
  'illicit/violent':         'violent illicit activity',
};

async function checkOpenAI(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // gracefully skip if not configured

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: prompt, model: 'omni-moderation-latest' }),
      signal: AbortSignal.timeout(5_000), // 5 s timeout — don't block generation
    });

    if (!res.ok) {
      console.warn('[moderation] OpenAI API returned', res.status, '— skipping');
      return null;
    }

    const data = (await res.json()) as OpenAIModerationResponse;
    const result = data.results[0];
    if (!result?.flagged) return null;

    // Find the highest-scoring flagged category for a descriptive message
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([cat]) => CATEGORY_LABELS[cat] ?? cat);

    const label = flaggedCategories[0] ?? 'policy-violating content';
    return `Your prompt was flagged for ${label} and cannot be used for generation.`;
  } catch (err) {
    // Network error / timeout — don't block the user, just log
    console.warn('[moderation] OpenAI check failed, skipping:', (err as Error).message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export async function moderatePrompt(prompt: string): Promise<ModerationResult> {
  // Layer 1 — always runs, instant
  const blocklistReason = checkBlocklist(prompt);
  if (blocklistReason) {
    console.warn('[moderation] Blocked by local blocklist:', prompt.slice(0, 80));
    return { allowed: false, reason: blocklistReason };
  }

  // Layer 2 — OpenAI (only if API key configured)
  const openaiReason = await checkOpenAI(prompt);
  if (openaiReason) {
    console.warn('[moderation] Blocked by OpenAI moderation:', prompt.slice(0, 80));
    return { allowed: false, reason: openaiReason };
  }

  return { allowed: true };
}
