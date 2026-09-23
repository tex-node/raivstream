/**
 * Raivstream 5.0 — Intent Readiness Gate.
 *
 * Product principle:
 *   Raivstream may invent creative TREATMENT (lighting, camera, pacing, style,
 *   music, environment, composition) but must NOT invent essential user-owned
 *   SOURCE entities (the creator's real product, brand, logo, likeness, or a
 *   supplied reference asset) unless the creator explicitly authorizes a
 *   fictional replacement.
 *
 * This extends the existing Intent Engine (it consumes a CreativeInterpretation)
 * rather than replacing or duplicating it. It is a pure function so the rules
 * are unit-testable; the service adapter supplies the available context.
 */

import type { PrismaClient } from '@raivstream/database';
import type { CreativeInterpretation, CreativeProjectType } from '../shared/types';
import { intentService } from './service';

export type ReadinessContextType = 'PRODUCT' | 'BRAND' | 'LOGO' | 'PERSON' | 'SOURCE';

export type IntentReadiness =
  | { ready: true }
  | {
      ready: false;
      reason: 'MISSING_ESSENTIAL_CONTEXT';
      question: string;
      contextType: ReadinessContextType;
    };

export interface ReadinessSignals {
  /** The creator attached the source (product photo, logo, image/video, reference). */
  hasSourceAsset?: boolean;
  /** The creator already has a product in their Studio context. */
  hasStudioProduct?: boolean;
  /** The creator already has a usable source asset in this project. */
  hasProjectSource?: boolean;
}

// Explicit authorization to invent the source entity.
const FICTIONAL = /\b(fictional|fictitious|imaginary|invent(ed|ing)?|make[- ]?up|made[- ]?up|concept|mock|pretend|not real|hypothetical|prototype)\b/i;

const OWNED_LOGO = /\b(my|our)\b[^.?!]{0,16}\blogo\b/i;
const OWNED_PERSON = /\b(my|our)\b[^.?!]{0,16}\b(face|likeness|selfie|resemblance|portrait|photo|picture|image)\b|\b(photo|picture|image|headshot|video) of (me|us)\b|\bbased on (a |the )?real person\b/i;

// Semantic commercial-ownership: a first-person possessor ("my/our") plus a
// commercial purpose (from the interpretation, or a promotion verb). This is
// NOT a product-noun list — it asks "does the creator own a real commercial
// entity here?" so it generalizes to any product/brand/business. Only used to
// pick the creator-facing context TYPE (BRAND vs PRODUCT).
const OWNERSHIP = /\b(my|our)\b/i;
const COMMERCIAL_PURPOSE = /\b(promote|promotion|adverti[sz](e|ing)|ads?\b|campaign|commercial|market(ing)?|launch(ing)?|sell(ing)?|sale)\b/i;
const BRAND_LIKE = /\b(brand|company|business|label|store|shop|restaurant|salon|clinic|agency|startup|firm|enterprise|studio)\b/i;

const SOURCE_ASSET = /\b(turn|transform|convert|animate|restyle|upgrade|remix)\b[^.?!]{0,30}\b(this|my|our|the)\b[^.?!]{0,20}\b(image|photo|picture|video|clip|recording|footage|song|track|audio|design|logo|artwork)\b|\busing (this|my|our|the) (image|photo|video|clip|recording|footage)\b|\bfrom (this|my|our|the) (image|photo|video|clip)\b/i;

// Transform intent regardless of how the project type is classified (a
// "transform this into an ad" reads as COMMERCIAL but is still source-bound).
const TRANSFORM_INTENT = /\b(transform|turn\b[^.?!]{0,20}\binto|convert\b[^.?!]{0,20}\binto|animate|restyle|remix)\b/i;

// A commercial brief with no subject at all ("Promote something").
const COMMERCIAL_SUBJECT = /\b(product|brand|company|business|label|perfume|serum|skincare|cosmetic|cream|drink|bottle|whiskey|wine|beer|sneaker|shoe|bag|watch|jewel|fashion|apparel|device|gadget|app|software|service|food|snack|coffee|beverage|candle|soap|makeup|offer|sale|launch|campaign|collection|menu)\b/i;

/**
 * The gate. Returns ready when Raivstream has enough to build WITHOUT inventing
 * an essential user-owned source entity.
 */
export function assessIntentReadiness(
  text: string,
  interpretation: CreativeInterpretation,
  signals: ReadinessSignals = {},
): IntentReadiness {
  const hasAsset = Boolean(signals.hasSourceAsset || signals.hasProjectSource);
  const hasStudioProduct = Boolean(signals.hasStudioProduct);
  const isTransform = interpretation.projectType === 'TRANSFORMATION' || TRANSFORM_INTENT.test(text);

  // Explicit permission to invent the source entity → Raivstream may proceed.
  if (FICTIONAL.test(text)) return { ready: true };

  if (OWNED_LOGO.test(text) && !hasAsset) {
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType: 'LOGO', question: 'Can you upload your logo so I use the real one?' };
  }
  // A first-person, commercially-purposed request refers to a real user-owned
  // entity → require its source unless an asset/Studio context already exists.
  const owned = OWNERSHIP.test(text);
  const isCommercial = interpretation.projectType === 'COMMERCIAL' || COMMERCIAL_PURPOSE.test(text);
  if (owned && isCommercial && !hasAsset && !hasStudioProduct) {
    const contextType = BRAND_LIKE.test(text) ? 'BRAND' : 'PRODUCT';
    const question = contextType === 'BRAND'
      ? 'What are you promoting? Add your brand assets (name and logo) so I use the real brand.'
      : 'Can you upload a photo of the product — or describe it — so I use the real product?';
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType, question };
  }
  if (SOURCE_ASSET.test(text) && !hasAsset) {
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType: 'SOURCE', question: 'Can you attach the image or video you want me to transform?' };
  }
  if (OWNED_PERSON.test(text) && !hasAsset) {
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType: 'PERSON', question: 'Can you attach a reference photo so I keep the right likeness?' };
  }

  // Transform is inherently source-dependent: it needs a real source (an image
  // the production capabilities can animate) unless invention was authorized
  // above. This gate fires BEFORE planning/production, never at the renderer.
  if (isTransform && !hasAsset) {
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType: 'SOURCE', question: 'What would you like to transform? Add an image I can use as the source.' };
  }

  // A bare "Promote something" with no subject: ask what it is, exactly once.
  if (
    !isTransform &&
    interpretation.projectType === 'COMMERCIAL' &&
    !COMMERCIAL_SUBJECT.test(text) &&
    text.trim().split(/\s+/).filter(Boolean).length <= 6
  ) {
    return { ready: false, reason: 'MISSING_ESSENTIAL_CONTEXT', contextType: 'PRODUCT', question: 'What are you promoting?' };
  }

  return { ready: true };
}

export class IntentReadinessService {
  async assess(
    prisma: PrismaClient,
    input: { userId: string; text: string; projectType?: CreativeProjectType; hasSourceAsset?: boolean },
  ): Promise<{ interpretation: CreativeInterpretation; readiness: IntentReadiness }> {
    const interpretation = intentService.interpret(input.text, input.projectType);
    // Existing Studio product context satisfies a product requirement.
    const studioProduct = await prisma.creativeProduct
      .findFirst({ where: { studio: { userId: input.userId } }, select: { id: true } })
      .catch(() => null);
    const readiness = assessIntentReadiness(input.text, interpretation, {
      hasSourceAsset: Boolean(input.hasSourceAsset),
      hasStudioProduct: Boolean(studioProduct),
    });
    return { interpretation, readiness };
  }
}

export const intentReadinessService = new IntentReadinessService();
