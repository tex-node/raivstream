import type { DirectedScene, StoryBlueprint } from '../storyIntelligence/types';
import { normaliseStoryVisualStyle, styleLabel, stylePromptBlock } from '../storyVisualStyles';
import { deriveCharacterLocks, characterLockToPromptString } from './characterLock';
import { parseCameraSpec, cameraSpecToString, detectCameraConflicts } from './camera';
import { collectAllConflicts } from './conflicts';
import { sanitizeStoryContent, sanitizeActionText, sanitizeEnvironmentText } from './injection';
import { buildBudgetedPrompt, buildBudgetedNegativePrompt, type PromptSection } from './budget';
import { buildNegativePromptParts, kidsSafetyText, checkKidsSafety } from './r16';
import {
  VPC_VERSION,
  VpcError,
  type CanonicalVisualPrompt,
  type CharacterVisualLock,
  type VpcComposerInput,
  type VpcComposerOutput,
  type LightingSpec,
  type CompositionSpec,
  type CompositionLayout,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enumLabel(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/_/g, ' ').toLowerCase();
}

function resolveAction(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string {
  const raw = ds?.action || scene.description;
  return sanitizeActionText(raw || '');
}

function resolveEmotion(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string | undefined {
  const raw = ds?.emotion || scene.emotion;
  return raw ? enumLabel(raw) : undefined;
}

function resolveEnvironment(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string {
  const raw = ds?.location || scene.locationType;
  return sanitizeEnvironmentText(raw || 'unspecified setting');
}

function resolveTimeOfDay(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string | undefined {
  const raw = ds?.timeOfDay || scene.timeOfDay;
  return raw ? enumLabel(raw) : undefined;
}

function resolveMood(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string | undefined {
  return ds?.mood ? enumLabel(ds.mood) : scene.mood ? enumLabel(scene.mood) : undefined;
}

function resolveWeather(scene: VpcComposerInput['scene']): string | undefined {
  return scene.weather ? enumLabel(scene.weather) : undefined;
}

function resolveLighting(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): LightingSpec {
  const freeformHint = ds?.lightingIntent ?? undefined;
  const enumVal = scene.lighting ? enumLabel(scene.lighting) : undefined;
  const quality = enumVal ?? 'natural';
  const envMood = scene.environmentMood ? enumLabel(scene.environmentMood) : undefined;
  return { quality, moodHint: envMood, freeformHint };
}

function resolveComposition(characterCount: number, hasGroupAction: boolean): CompositionSpec {
  let layout: CompositionLayout;
  if (characterCount > 2 || hasGroupAction) {
    layout = 'group';
  } else if (characterCount === 2) {
    layout = 'two_shot';
  } else {
    layout = 'rule_of_thirds';
  }
  return { layout, verticalFraming: '9:16' };
}

function resolveStoryBeat(ds: DirectedScene | null | undefined): string | undefined {
  return ds?.storyBeat ? sanitizeStoryContent(ds.storyBeat) : undefined;
}

function resolveDramaticPurpose(ds: DirectedScene | null | undefined): string | undefined {
  return ds?.dramaticPurpose ? sanitizeStoryContent(ds.dramaticPurpose) : undefined;
}

function resolveSpatialRelationships(
  ds: DirectedScene | null | undefined,
  characterCount: number,
): string | undefined {
  if (!ds || characterCount < 2) return undefined;
  const action = ds.action ?? '';
  // Extract spatial cues from directed action text
  const spatialCues: string[] = [];
  if (/\bside by side\b|\bnext to\b|\bbeside\b/i.test(action)) spatialCues.push('side by side');
  if (/\bforeground\b/i.test(action)) spatialCues.push('focal character in foreground');
  if (/\bbackground\b/i.test(action)) spatialCues.push('secondary character in background');
  if (/\bfacing\b|\bturned toward\b/i.test(action)) spatialCues.push('characters facing each other');
  if (/\bbehind\b/i.test(action)) spatialCues.push('one character behind the other');
  if (/\bkneeling\b|\bcrouch/i.test(action)) spatialCues.push('one character lower than the other');
  return spatialCues.length ? spatialCues.join(', ') : undefined;
}

function resolveContinuity(
  ds: DirectedScene | null | undefined,
  blueprint: StoryBlueprint | null | undefined,
  characterLocks: CharacterVisualLock[],
): string[] {
  const rules: string[] = [];
  if (ds?.continuityIn) rules.push(sanitizeStoryContent(ds.continuityIn));
  if (ds?.continuityOut) rules.push(sanitizeStoryContent(ds.continuityOut));
  if (blueprint?.continuityRules?.length) {
    blueprint.continuityRules.slice(0, 4).forEach((rule) => {
      rules.push(sanitizeStoryContent(rule));
    });
  }
  // Always add character visual lock continuity
  if (characterLocks.length) {
    const names = characterLocks.map((ch) => ch.canonicalName).join(', ');
    rules.push(`preserve exact visual identity for: ${names}`);
  }
  return rules.filter(Boolean);
}

function resolveRequiredDetails(ds: DirectedScene | null | undefined, action: string): string[] {
  // Extract scene-critical props from DirectedScene visualFocus or action text
  const details: string[] = [];
  if (ds?.visualFocus) details.push(sanitizeStoryContent(ds.visualFocus));
  // Extract mentioned props from action text (simple keyword-based)
  const propPattern = /\b(backpack|bag|basket|book|drum|bicycle|umbrella|cake|candle|lantern|flag|ball|kite|letter|gift|box|trophy|crown|key|map|flower|fruit|mirror|yam|calabash|bowl|pot)\b/gi;
  const found = new Set<string>();
  for (const match of action.matchAll(propPattern)) {
    found.add(match[1].toLowerCase());
  }
  found.forEach((item) => details.push(`include: ${item}`));
  return details.slice(0, 4);
}

function resolveSceneCharacterNames(scene: VpcComposerInput['scene'], ds: DirectedScene | null | undefined): string[] {
  if (ds?.characters?.length) return ds.characters;
  if (Array.isArray(scene.characters)) {
    return scene.characters.flatMap((ch) => {
      if (typeof ch === 'string') return [ch];
      if (ch && typeof ch === 'object' && typeof (ch as Record<string, unknown>).name === 'string') {
        return [(ch as Record<string, unknown>).name as string];
      }
      return [];
    });
  }
  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDepictedCharacterNames(
  explicitSceneCharacterNames: string[],
  characterMemory: VpcComposerInput['project']['characterMemory'],
  action: string,
): string[] {
  if (explicitSceneCharacterNames.length) return explicitSceneCharacterNames;
  const actionText = action.toLowerCase();
  return (characterMemory ?? [])
    .filter((character) => {
      const name = character.name?.trim();
      if (!name) return false;
      return new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`).test(actionText);
    })
    .map((character) => character.name);
}

function lightingSpecToString(spec: LightingSpec): string {
  const parts: string[] = [spec.quality];
  if (spec.moodHint) parts.push(`${spec.moodHint} mood`);
  if (spec.freeformHint) parts.push(spec.freeformHint);
  return parts.join(', ');
}

function compositionSpecToString(spec: CompositionSpec): string {
  const layouts: Record<string, string> = {
    centered: 'centered composition',
    rule_of_thirds: 'rule-of-thirds framing',
    foreground_framing: 'foreground-framed composition',
    over_shoulder: 'over-the-shoulder framing',
    two_shot: 'two-shot composition',
    group: 'group composition with clear focal subject',
    negative_space: 'negative-space composition',
  };
  return `${layouts[spec.layout] ?? 'clean composition'}, ${spec.verticalFraming} vertical mobile framing`;
}

// ─── Main Compose Function ────────────────────────────────────────────────────

export function compose(input: VpcComposerInput): VpcComposerOutput {
  const { scene, project, medium, audienceMode, directedScene: ds, blueprint } = input;

  if (!scene.id || !scene.title) {
    throw new VpcError('MISSING_SCENE_CONTEXT', 'Scene must have id and title');
  }

  // Core scene fields
  const action = resolveAction(scene, ds);
  const emotion = resolveEmotion(scene, ds);
  const environment = resolveEnvironment(scene, ds);
  const timeOfDay = resolveTimeOfDay(scene, ds);
  const weather = resolveWeather(scene);
  const mood = resolveMood(scene, ds);

  // Resolve scene character names from explicit scene data first, then infer
  // from the resolved action. Identity locks may still include background
  // references, but composition should be based on who is actually depicted.
  const characterMemory = project.characterMemory ?? [];
  const sceneCharacterNames = resolveSceneCharacterNames(scene, ds);
  const depictedCharacterNames = resolveDepictedCharacterNames(sceneCharacterNames, characterMemory, action);
  const characterLocks = deriveCharacterLocks(characterMemory, depictedCharacterNames.length ? depictedCharacterNames : sceneCharacterNames);

  // Style
  const styleKey = normaliseStoryVisualStyle(project.visualStyle);
  const styleName = styleLabel(styleKey);
  const styleBlock = stylePromptBlock(styleKey);

  // Camera
  const cameraSpec = parseCameraSpec(
    scene.cameraStyle,
    ds?.cameraIntent,
    medium,
    characterLocks.length,
  );
  const cameraConflicts = detectCameraConflicts(cameraSpec);

  // Composition
  // "class" only means a group of students when preceded by "the" or "whole", not "to class"
  const hasGroupAction = /\b(group|crowd|everyone|all|children|family|team)\b|\b(the|whole|entire)\s+class\b/i.test(action);
  const depictedCharacterCount = depictedCharacterNames.length || (characterLocks.length ? 1 : 0);
  const composition = resolveComposition(depictedCharacterCount, hasGroupAction);

  // Lighting
  const lighting = resolveLighting(scene, ds);

  // Spatial relationships (multi-character)
  const spatialRelationships = resolveSpatialRelationships(ds, characterLocks.length);

  // Continuity
  const continuity = resolveContinuity(ds, blueprint, characterLocks);

  // Required details
  const requiredDetails = resolveRequiredDetails(ds, action);

  // Story beat / dramatic purpose from DirectedScene
  const storyBeat = resolveStoryBeat(ds);
  const dramaticPurpose = resolveDramaticPurpose(ds);

  // Focal subject (primary character name, or first scene character)
  const focalCharacter = characterLocks.find((ch) => ch.isFocal);
  const focalSubject = focalCharacter?.canonicalName
    ?? sceneCharacterNames[0]
    ?? 'the main character';

  // R16 / KIDS safety
  const kidsCheck = checkKidsSafety(audienceMode, action);
  if (!kidsCheck.safe) {
    throw new VpcError('UNSAFE_VISUAL_REQUEST', kidsCheck.reason ?? 'Unsafe content for KIDS audience');
  }

  const safetyText = kidsSafetyText(audienceMode);
  const negativePromptParts = buildNegativePromptParts(audienceMode, medium);

  // Conflict detection
  const characterDescriptions = characterLocks.map((ch) => ch.physicalDescription ?? '');
  const allConflicts = collectAllConflicts({
    indoorOutdoor: scene.indoorOutdoor,
    locationType: scene.locationType,
    timeOfDay: scene.timeOfDay,
    lighting: scene.lighting,
    action,
    focalSubjectHint: action,
    characterCount: characterLocks.length,
    characterDescriptions,
    cameraConflicts,
  });

  // ─── Build canonical structure ──────────────────────────────────────────────

  const canonical: Omit<CanonicalVisualPrompt, 'renderedPrompt' | 'renderedNegativePrompt'> = {
    version: VPC_VERSION,
    medium,
    sceneId: scene.id,
    storyTitle: sanitizeStoryContent(project.title),
    sceneTitle: sanitizeStoryContent(scene.title),
    storyBeat,
    dramaticPurpose,
    focalSubject,
    characters: characterLocks,
    action,
    emotion,
    environment,
    timeOfDay,
    weather,
    spatialRelationships,
    camera: cameraSpec,
    composition,
    lighting,
    continuity,
    style: styleKey,
    stylePromptBlock: styleBlock,
    requiredDetails,
    forbiddenDetails: negativePromptParts,
    negativePromptParts,
    audienceMode,
    detectedConflicts: allConflicts,
  };

  // ─── Render to string ───────────────────────────────────────────────────────

  const characterIdentityParts = characterLocks.map(characterLockToPromptString);
  const characterIdentityString = characterIdentityParts.length
    ? characterIdentityParts.join('; ')
    : 'use the established main character design from the story';

  const environmentString = [
    environment,
    scene.indoorOutdoor ? `(${enumLabel(scene.indoorOutdoor)})` : undefined,
    timeOfDay ? `${timeOfDay}` : undefined,
    weather ? `${weather} weather` : undefined,
  ].filter(Boolean).join(', ');

  const cameraString = cameraSpecToString(cameraSpec, medium);
  const compositionString = compositionSpecToString(composition);
  const lightingString = lightingSpecToString(lighting);

  const sections: PromptSection[] = [
    {
      priority: 0,
      label: 'style',
      text: `Visual style: ${styleBlock}`,
      required: true,
    },
    {
      priority: 1,
      label: 'story_context',
      text: [
        `${medium === 'IMAGE' ? 'Scene illustration' : 'Scene video'} for "${canonical.storyTitle}"`,
        `scene: "${canonical.sceneTitle}"`,
        storyBeat ? `story beat: ${storyBeat}` : undefined,
      ].filter(Boolean).join(', '),
      required: true,
    },
    {
      priority: 2,
      label: 'character_identity',
      text: [
        `Characters, preserve exact visual identity: ${characterIdentityString}`,
        depictedCharacterNames.length
          ? `Depict in this scene: ${depictedCharacterNames.join(', ')}. Use other listed character locks only as continuity reference; do not add offscreen characters unless named in the action`
          : undefined,
      ].filter(Boolean).join('. '),
      required: true,
    },
    {
      priority: 3,
      label: 'action',
      text: `Action: ${action}`,
      required: true,
    },
    {
      priority: 4,
      label: 'environment',
      text: `Setting: ${environmentString}`,
      required: true,
    },
    spatialRelationships ? {
      priority: 5,
      label: 'spatial',
      text: `Spatial: ${spatialRelationships}`,
    } : null,
    emotion ? {
      priority: 6,
      label: 'emotion',
      text: `Emotional tone: ${emotion}`,
    } : null,
    {
      priority: 7,
      label: 'camera',
      text: `Camera: ${cameraString}`,
    },
    {
      priority: 8,
      label: 'composition',
      text: `Composition: ${compositionString}`,
    },
    {
      priority: 9,
      label: 'lighting',
      text: `Lighting: ${lightingString}`,
    },
    continuity.length ? {
      priority: 10,
      label: 'continuity',
      text: `Continuity: ${continuity.slice(0, 3).join('; ')}`,
    } : null,
    requiredDetails.length ? {
      priority: 11,
      label: 'required_details',
      text: requiredDetails.join('. '),
    } : null,
    mood ? {
      priority: 12,
      label: 'mood',
      text: `Atmosphere: ${mood}`,
    } : null,
    {
      priority: 13,
      label: 'safety',
      text: `Safety: ${safetyText}`,
      required: true,
    },
    {
      priority: 14,
      label: 'overlay_protection',
      text: 'No visible text, no UI overlays, no social-media interface, no phone screen, no gallery framing, no watermarks',
      required: true,
    },
  ].filter(Boolean) as PromptSection[];

  const renderedPrompt = buildBudgetedPrompt(sections, input.maxPromptLength);
  const renderedNegativePrompt = buildBudgetedNegativePrompt(negativePromptParts, input.maxNegativePromptLength);

  const fullCanonical: CanonicalVisualPrompt = {
    ...canonical,
    renderedPrompt,
    renderedNegativePrompt,
  };

  return {
    canonical: fullCanonical,
    prompt: renderedPrompt,
    negativePrompt: renderedNegativePrompt,
    styleUsed: styleName,
    characterIdentity: characterIdentityString,
    composerVersion: VPC_VERSION,
    composerCost: 0,
  };
}
