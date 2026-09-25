/**
 * Raivstream 5.0 — Production Plan (semantic, creator-facing).
 *
 * BRIEF + BIBLE → scenes → shots → timeline. The creator thinks in scenes; the
 * system decides the shot breakdown automatically (5–6s shots, the MiniMax H3
 * convention) — never expose shot-grid configuration. Deterministic baseline so
 * the plan is instant, reproducible and unit-testable; the production adapter
 * can enrich it via the existing structurer/sequence planning later.
 */

import type { CreativeBibleState, CreativeBriefState, CreativeProjectType } from '../shared/types';
import type { ProductionContext } from './contextAdapter';

export interface PlanShot {
  shotId: string;
  title: string;
  description: string;
  camera?: string;
  durationSeconds: number;
  visualDirection?: string;
  audioDirection?: string;
}

export interface PlanScene {
  sceneId: string;
  order: number;
  title: string;
  beat: string;
  description: string;
  location?: string;
  timeOfDay?: string;
  characters: string[];
  narration?: string;
  /** Project-wide creative direction applied by the Director (e.g. slogan, tone). */
  creativeDirection?: string;
  /** Per-scene camera/motion instruction for the video generation step. */
  motionDirection?: string;
  shots: PlanShot[];
  estimatedDurationSeconds: number;
}

export interface PlanTimelineEntry {
  sceneId: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Canonical source reference — the same identity readiness and production
 * resolve. `url` is present only when the source is actually usable by a
 * generation capability (a label-only reference is not utilizable).
 */
export interface CreativeSourceReference {
  id: string;
  kind: 'image' | 'video';
  origin: 'upload' | 'project' | 'studio';
  label?: string;
  url?: string;
}

export interface CreativeProductionPlanState {
  version: number;
  structure?: string;
  format?: string;
  targetDurationSeconds?: number;
  scenes: PlanScene[];
  totalRuntimeSeconds: number;
  timeline: PlanTimelineEntry[];
  notes: string[];
  /** Context snapshot (Phase 9): the inherited series/studio context the plan
   *  was built with, so production is reproducible ("Raivstream remembered"). */
  contextSnapshot?: ProductionContext;
  /** Source references required by this creative, carried into production so
   *  the generation adapter can resolve the SAME source readiness approved. */
  sourceReferences?: CreativeSourceReference[];
}

// ─── Structure templates by project type ──────────────────────────────────────

const SHOT_DURATIONS = [5, 6] as const;

interface SceneTemplate {
  title: string;
  beat: string;
  description: string;
  location?: string;
  timeOfDay?: string;
  shotIdeas: string[];
}

function structureFor(type: CreativeProjectType): { name: string; scenes: SceneTemplate[] } {
  switch (type) {
    case 'COMMERCIAL':
      return {
        name: 'Hook → Product → Benefit → Call to action',
        scenes: [
          { title: 'The Hook', beat: 'Grab attention', description: 'Open on a striking, premium image that sets the mood.', shotIdeas: ['Slow push-in on the product silhouette', 'Texture and light detail', 'Confident subject enters frame'] },
          { title: 'Product Reveal', beat: 'Introduce the product', description: 'Reveal the product as the hero of the frame.', shotIdeas: ['The product glides into focus', 'Elegant close-up of packaging', 'Motion on the surface'] },
          { title: 'The Benefit', beat: 'Show the value', description: 'Demonstrate the result the product delivers.', shotIdeas: ['Transformation on a subject', 'Before and after light shift', 'Confident, modern lifestyle moment'] },
          { title: 'Call to Action', beat: 'Finish strong', description: 'Leave the viewer with the brand and a clear takeaway.', shotIdeas: ['Brand wordmark reveal', 'Final confident glance', 'Logo on a clean backdrop'] },
        ],
      };
    case 'EDUCATION':
      return {
        name: 'Hook → Explain → Example → Recap',
        scenes: [
          { title: 'The Hook', beat: 'Get them curious', description: 'Open with a question or wonder that invites learning.', shotIdeas: ['A curious question on screen', 'Playful illustrative intro', 'Learner looking up in wonder'] },
          { title: 'Explain', beat: 'Teach the idea', description: 'Break the concept into a clear, simple explanation.', shotIdeas: ['Clear diagram builds', 'A friendly guide speaks', 'Key terms appear simply'] },
          { title: 'Example', beat: 'Show it working', description: 'Bring the idea to life with a concrete example.', shotIdeas: ['A real-world scene demonstrates the idea', 'Step-by-step visuals', 'Cheerful confirmation'] },
          { title: 'Recap', beat: 'Lock it in', description: 'Summarize what was learned in one warm moment.', shotIdeas: ['The big idea repeated', 'Encouraging closing', 'Celebratory ending'] },
        ],
      };
    case 'TRANSFORMATION':
      return {
        name: 'Before → During → After',
        scenes: [
          { title: 'Before', beat: 'Establish the starting point', description: 'Show where things begin.', shotIdeas: ['The starting state in soft light', 'A moment of hesitation', 'Stillness before change'] },
          { title: 'During', beat: 'Show the change', description: 'Reveal the transformation in motion.', shotIdeas: ['The change begins', 'Mid-transformation detail', 'Energy and movement'] },
          { title: 'After', beat: 'Reveal the result', description: 'Land on the transformed outcome.', shotIdeas: ['The result revealed', 'Confident final look', 'The world reacts'] },
        ],
      };
    case 'STORY':
    default:
      return {
        name: 'Setup → Rising action → Turning point → Resolution',
        scenes: [
          { title: 'The Setup', beat: 'Meet the protagonist', description: 'Establish the character and their world.', shotIdeas: ['The character in their world', 'A telling detail', 'The journey begins'] },
          { title: 'Rising Action', beat: 'Build the conflict', description: 'Introduce the obstacle and raise the stakes.', shotIdeas: ['The obstacle appears', 'Determination builds', 'A meaningful exchange'] },
          { title: 'Turning Point', beat: 'Change everything', description: 'The moment the story turns.', shotIdeas: ['The decision', 'A reveal that reframes everything', 'The emotional peak'] },
          { title: 'Resolution', beat: 'Resolve', description: 'Bring the story to a satisfying close.', shotIdeas: ['The change made visible', 'A quiet, earned moment', 'The ending'] },
        ],
      };
  }
}

function characterNames(bible?: CreativeBibleState | null): string[] {
  return ((bible?.characters ?? []) as Array<{ name?: string }>)
    .map((character) => character.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 3);
}

/**
 * Extract the product/subject noun from a commercial intent so scene descriptions
 * and narration name the actual thing being promoted rather than "the product".
 * Returns "product" as the safe fallback when no noun can be extracted.
 *
 * Prefers originalIntent over refinedIntent: the Director's restatement often
 * contains format words like "promotional video" that the regex incorrectly
 * captures as the product noun (e.g. "video" from "Goal: promotional video.").
 */
function extractProductNoun(brief?: CreativeBriefState | null): string {
  // originalIntent is the raw creator input; refinedIntent has been processed by
  // the Director and may contain format words that pollute the regex match.
  const intent = ((brief?.originalIntent ?? '').trim() || (brief?.refinedIntent ?? '').trim());
  if (!intent) return 'product';
  // Block format/medium words that name the output type, not the subject being promoted.
  const formatWords = new Set(['video', 'film', 'commercial', 'ad', 'advertisement', 'content', 'media', 'clip', 'reel']);
  const terminator = /(?:\s+with|\s+using|\s+and|,|\.|called|\s+brand\b|\s+product\b|$)/i;
  const TERM = '(?:\\s+with|\\s+using|\\s+and|,|\\.|called|\\s+brand\\b|\\s+product\\b|$)';

  // Primary: match subject noun after common commercial verbs + optional articles.
  const match = intent.match(
    new RegExp(`(?:promot|advertis|market|commercial\\s+for|advertisement\\s+for|campaign\\s+for|video\\s+for|ad\\s+for)\\w*\\s+(?:a\\s+|an?\\s+|my\\s+|our\\s+)?([a-z][a-z\\s-]{0,40}?)${TERM}`, 'i'),
  );
  const noun = match?.[1]?.trim();

  // If the primary match captured a format word (e.g. "promotional" matched
  // "promot\w*" but then captured "video for X"), fall through to secondary.
  if (noun && noun.length > 1 && !formatWords.has(noun.toLowerCase().split(/\s+/)[0])) {
    return noun;
  }

  // Secondary: "make a video/film/commercial for X" — extract X directly.
  const forMatch = intent.match(
    new RegExp(`(?:video|film|commercial|ad|advertisement|content|clip|reel)\\s+for\\s+(?:a\\s+|an?\\s+|my\\s+|our\\s+|the\\s+)?([a-z][a-z\\s-]{0,40}?)${TERM}`, 'i'),
  );
  const forNoun = forMatch?.[1]?.trim();
  if (forNoun && forNoun.length > 1 && !formatWords.has(forNoun.toLowerCase())) return forNoun;

  if (!noun || noun.length <= 1 || formatWords.has(noun.toLowerCase())) return 'product';
  return noun;
}

function objectiveFor(type: CreativeProjectType, brief?: CreativeBriefState | null): string {
  if (brief?.objective) return brief.objective;
  if (type === 'COMMERCIAL') {
    const noun = extractProductNoun(brief);
    return noun !== 'product' ? `promote the ${noun}` : 'deliver a premium brand moment';
  }
  return type === 'EDUCATION' ? 'explain the idea clearly' : 'tell the story';
}

function narrationFor(type: CreativeProjectType, scene: SceneTemplate, objective: string, index: number): string {
  switch (type) {
    case 'COMMERCIAL':
      return index === 3 ? 'Be part of the feeling. Discover the difference.' : `Every detail is designed for ${objective}.`;
    case 'EDUCATION':
      return index === 0 ? 'Have you ever wondered why this works the way it does?' : index === 3 ? 'Now you know — and you can explain it too.' : "Let's look closer at how it works.";
    default:
      return `${scene.title} — the story deepens here.`;
  }
}

/**
 * Per-beat creative direction for commercial scenes — gives the generation layer
 * a specific visual intent for each structural moment rather than leaving all
 * four scenes with identical generic prompts.
 */
function creativeDirectionFor(type: CreativeProjectType, productNoun: string, beat: string): string | undefined {
  if (type !== 'COMMERCIAL') return undefined;
  switch (beat) {
    case 'Grab attention':
      return `Dramatic atmospheric reveal — evocative mood, premium feel, ${productNoun} as the centrepiece against a moody backdrop`;
    case 'Introduce the product':
      return `Hero product moment — pristine ${productNoun} in sharp close-up detail, aspirational framing, luxurious surface texture`;
    case 'Show the value':
      return `Lifestyle aspiration — ${productNoun} in a beautiful experiential context that makes the benefit feel tangible and desirable`;
    case 'Finish strong':
      return `Brand statement — confident ${productNoun} with clean composition, strong identity, leaves a clear emotional impression`;
    default:
      return undefined;
  }
}

function buildShots(sceneIndex: number, scene: SceneTemplate): PlanShot[] {
  return scene.shotIdeas.map((idea, shotIndex) => ({
    shotId: `SCENE_${String(sceneIndex + 1).padStart(2, '0')}_SHOT_${String(shotIndex + 1).padStart(2, '0')}`,
    title: idea,
    description: idea,
    camera: shotIndex === 0 ? 'Slow push-in' : shotIndex === 1 ? 'Close-up' : 'Wide, steady',
    durationSeconds: SHOT_DURATIONS[shotIndex % SHOT_DURATIONS.length],
    visualDirection: 'cinematic, consistent with the visual language',
    audioDirection: shotIndex === 0 ? 'atmosphere first' : 'layered in as the shot builds',
  }));
}

export function buildCreativePlan(input: {
  projectType: CreativeProjectType;
  brief?: CreativeBriefState | null;
  bible?: CreativeBibleState | null;
  version?: number;
  context?: ProductionContext;
  sourceReferences?: CreativeSourceReference[];
}): CreativeProductionPlanState {
  const structure = structureFor(input.projectType);
  const characters = characterNames(input.bible);
  const objective = objectiveFor(input.projectType, input.brief);
  // For commercial projects, substitute the actual product noun into scene
  // descriptions so prompts name the thing being promoted rather than "product".
  const productNoun = input.projectType === 'COMMERCIAL' ? extractProductNoun(input.brief) : 'product';
  const scenes: PlanScene[] = structure.scenes.map((template, index) => {
    const shots = buildShots(index, template);
    const estimatedDurationSeconds = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    const description = productNoun !== 'product'
      ? template.description.replace(/\bthe product\b/gi, `the ${productNoun}`).replace(/\bproduct\b/gi, productNoun)
      : template.description;
    return {
      sceneId: `SCENE_${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      title: template.title,
      beat: template.beat,
      description,
      location: template.location,
      timeOfDay: template.timeOfDay,
      characters,
      narration: narrationFor(input.projectType, template, objective, index),
      creativeDirection: creativeDirectionFor(input.projectType, productNoun, template.beat),
      shots,
      estimatedDurationSeconds,
    };
  });

  let cursor = 0;
  const timeline: PlanTimelineEntry[] = scenes.map((scene) => {
    const start = cursor;
    const end = start + scene.estimatedDurationSeconds;
    cursor = end;
    return { sceneId: scene.sceneId, startSeconds: start, endSeconds: end };
  });

  return {
    version: input.version ?? 1,
    structure: structure.name,
    format: input.brief?.format,
    targetDurationSeconds: input.brief?.durationSeconds,
    scenes,
    totalRuntimeSeconds: cursor,
    timeline,
    notes: [
      'Shot breakdown is decided automatically so the timing stays tight and cinematic.',
      'Continuity (character identity, world, visual language, last-frame flow) is protected during production.',
      'You direct the outcome — you never need to touch shots, models or providers.',
      input.context?.source === 'SERIES' ? 'This episode inherits your series canon — identity, world and visual language are already remembered.' : undefined,
      input.context?.source === 'STUDIO' ? `This campaign inherits your brand context${input.context.brandName ? ` (${input.context.brandName})` : ''} — no need to re-enter it.` : undefined,
      input.brief?.durationSeconds && Math.abs(cursor - input.brief.durationSeconds) > 12
        ? `Target runtime ${input.brief.durationSeconds}s; this plan previews ~${cursor}s. You can direct the pacing later.`
        : undefined,
    ].filter((note): note is string => Boolean(note)),
    contextSnapshot: input.context,
    sourceReferences: input.sourceReferences,
  };
}