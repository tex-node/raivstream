/**
 * Raivstream 5.0 — Production context adapter (Phase 9).
 *
 * SeriesContext / StudioContext are seeded into the Creative Bible (and Brief)
 * when an episode or campaign project is created. This adapter turns that
 * inherited context into a compact, semantic production context consumed by the
 * generation layer through the existing capability router.
 *
 * The creator experiences the result as "Raivstream remembered" — never as
 * "Raivstream added more prompt text". The context is snapshotted into the plan
 * so a run stays reproducible (context snapshotting).
 */

import type { CreativeBibleState, CreativeBriefState } from '../shared/types';

export type ProductionContextSource = 'SERIES' | 'STUDIO' | 'PROJECT';

export interface ProductionContext {
  source: ProductionContextSource;
  audience?: string;
  tone?: string;
  brandName?: string;
  approvedMessaging?: string[];
  visualLanguage?: string;
  audioLanguage?: string;
  storyRules?: string[];
  worldRules?: string[];
  characterCanon?: Array<{ name: string; description?: string }>;
  snapshotAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(str).filter((item): item is string => Boolean(item));
  const single = str(value);
  return single ? [single] : [];
}

function characterCanon(canon: Record<string, unknown>): Array<{ name: string; description?: string }> {
  const source = canon.characterCanon;
  if (!Array.isArray(source)) return [];
  return source
    .map((entry) => asRecord(entry))
    .map((entry) => ({ name: str(entry.name) ?? '', description: str(entry.description) }))
    .filter((entry) => entry.name);
}

/**
 * Build the semantic production context from the project's inherited Bible +
 * Brief. Pure and deterministic (the timestamp is injectable for tests).
 */
export function buildProductionContext(input: {
  brief?: CreativeBriefState | null;
  bible?: CreativeBibleState | null;
  now?: Date;
}): ProductionContext {
  const bible = input.bible ?? null;
  const brief = input.brief ?? null;
  const brand = asRecord(bible?.brand);
  const canon = asRecord(bible?.canon);
  const visualLanguage = asRecord(bible?.visualLanguage);
  const audioLanguage = asRecord(bible?.audioLanguage);
  const audience = asRecord(bible?.audience);
  const brandIdentity = asRecord(brand.brandIdentity);
  const brandTone = asRecord(brand.tone);

  // Studio seeding stores the brand name under `brand.brandIdentity.name` and the
  // product name under `brand.product`; accept both plus a direct `brand.name`.
  const brandName = str(brand.name) ?? str(brand.brandName) ?? str(brandIdentity.name) ?? str(brand.product);
  const hasSeriesCanon = Boolean(canon.world ?? canon.storyRules ?? canon.worldRules ?? canon.characterCanon);
  const source: ProductionContextSource = brandName ? 'STUDIO' : hasSeriesCanon ? 'SERIES' : 'PROJECT';

  return {
    source,
    audience: str(brief?.audience) ?? str(audience.description) ?? str(audience.primary),
    tone: str(brandTone.style) ?? str(brandTone.description) ?? str(brief?.tone) ?? str(visualLanguage.tone),
    brandName,
    approvedMessaging: strList(brand.approvedMessaging),
    visualLanguage: str(visualLanguage.style),
    audioLanguage: str(audioLanguage.style),
    storyRules: strList(canon.storyRules),
    worldRules: strList(canon.worldRules),
    characterCanon: characterCanon(canon),
    snapshotAt: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * A compact, human-meaningful context line appended to generation prompts by the
 * capability router. This is the ONLY place inherited context reaches the
 * generation layer — the UI never shows prompt text.
 */
export function contextPromptLine(context: ProductionContext | undefined | null): string {
  if (!context) return '';
  const parts: string[] = [];
  if (context.brandName) parts.push(`brand ${context.brandName}`);
  if (context.audience) parts.push(`made for ${context.audience}`);
  if (context.tone) parts.push(`tone: ${context.tone}`);
  if (context.approvedMessaging?.length) parts.push(`messaging: ${context.approvedMessaging.join('; ')}`);
  if (context.storyRules?.length) parts.push(`series rules: ${context.storyRules.join('; ')}`);
  if (context.worldRules?.length) parts.push(`world rules: ${context.worldRules.join('; ')}`);
  return parts.join(', ');
}
