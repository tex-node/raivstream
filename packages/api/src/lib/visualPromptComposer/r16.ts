import type { StoryAudienceMode } from '../storyTextService';
import type { VpcErrorCode } from './types';

// ─── R16 / KIDS safety ────────────────────────────────────────────────────────

const KIDS_REQUIRED_NEGATIVE_TERMS = [
  'violence',
  'blood',
  'weapons',
  'adult themes',
  'dark horror',
  'sexual content',
  'unsafe behavior',
  'scary faces',
  'frightening imagery',
];

const GENERAL_REQUIRED_NEGATIVE_TERMS: string[] = [
  'graphic violence',
  'sexual content',
];

const SHARED_NEGATIVE_TERMS = [
  'text overlays',
  'watermark',
  'logo',
  'low resolution',
  'blurry',
  'distorted anatomy',
  'extra limbs',
  'phone UI',
  'social media UI',
  'gallery UI',
  'shot labels',
  '9:16 labels',
  'captions',
  'speech bubbles',
  'visible words',
  'app interface',
  'gallery controls',
  'social overlay',
  'subtitle bar',
];

const VIDEO_NEGATIVE_TERMS = [
  'flicker',
  'warped motion',
  'jump cuts',
];

const IMAGE_NEGATIVE_TERMS = [
  'cropped subject',
];

export function buildNegativePromptParts(
  audienceMode: StoryAudienceMode,
  medium: 'IMAGE' | 'VIDEO',
  userExclusions: string[] = [],
): string[] {
  const base = [
    ...SHARED_NEGATIVE_TERMS,
    ...(audienceMode === 'KIDS' ? KIDS_REQUIRED_NEGATIVE_TERMS : GENERAL_REQUIRED_NEGATIVE_TERMS),
    ...(medium === 'VIDEO' ? VIDEO_NEGATIVE_TERMS : IMAGE_NEGATIVE_TERMS),
    ...userExclusions,
  ];
  // Deduplicate
  const seen = new Set<string>();
  return base.filter((term) => {
    const key = term.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function kidsSafetyText(audienceMode: StoryAudienceMode): string {
  return audienceMode === 'KIDS'
    ? 'child-safe, gentle, friendly, no violence, no fear, no adult themes, warm and welcoming'
    : 'safe, polished, emotionally clear';
}

// Check if prompt content is likely age-appropriate for KIDS mode
// This is a simple keyword check — the primary safety mechanism is the negative prompt
const UNSAFE_KIDS_PATTERNS = [
  /\b(blood|gore|weapon|knife|gun|pistol|rifle|bomb|violence|murder|kill|death|corpse|dead\s+body)\b/i,
  /\b(sexual|nude|naked|adult\s+content|nsfw)\b/i,
  /\b(alcohol|drunk|beer|wine|liquor|cigarette|smoking|drugs)\b/i,
  /\b(horror|scary|terrifying|nightmare|demon|monster\s+attack)\b/i,
];

export function checkKidsSafety(
  audienceMode: StoryAudienceMode,
  text: string,
): { safe: boolean; reason?: string } {
  if (audienceMode !== 'KIDS') return { safe: true };
  for (const pattern of UNSAFE_KIDS_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: `Content may not be appropriate for KIDS audience: "${text.slice(0, 60)}..."` };
    }
  }
  return { safe: true };
}
