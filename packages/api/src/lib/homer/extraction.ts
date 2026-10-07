/**
 * Homer — Deterministic entity, beat, and thread extraction.
 *
 * All functions here are pure (no AI, no DB). They extract structure from:
 *   - Raw story text (for entity extraction and thread detection)
 *   - StoryBlueprint (for beat enrichment)
 *
 * The stableId() helper generates deterministic, collision-resistant IDs from
 * entity names so repeated interpretation never creates duplicate entities.
 */

import type { StoryBlueprint } from '../storyIntelligence/types';
import type {
  BeatFunction,
  CharacterRole,
  DecisionProvenance,
  HomerBeat,
  HomerCharacter,
  HomerClaim,
  HomerLocation,
  HomerObject,
  HomerThread,
  NarrativeImportance,
  StructuralPosition,
  ThreadKind,
} from './types';

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Lowercase normalized key — used for deduplication and alias matching. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
}

/** Stable entity id derived from name — deterministic for idempotency. */
export function stableId(kind: string, name: string): string {
  return `${kind}_${normalizeKey(name)}`;
}

export function claim<T>(value: T, provenance: DecisionProvenance, basis?: string): HomerClaim<T> {
  return basis !== undefined ? { value, provenance, basis } : { value, provenance };
}

// ─── Character extraction ─────────────────────────────────────────────────────

const PRONOUN_GROUPS: Record<CharacterRole, RegExp[]> = {
  protagonist: [/\b(he|she|they|the hero|the protagonist|the main character)\b/i],
  antagonist: [/\b(the villain|the antagonist|the enemy)\b/i],
  supporting: [],
  minor: [],
  unknown: [],
};

const ROLE_SIGNALS: Array<[CharacterRole, RegExp]> = [
  ['antagonist', /\b(villain|antagonist|enemy|oppressor|rival)\b/i],
  ['supporting', /\b(friend|mentor|guide|companion|ally|sidekick|parent|mother|father|teacher|helper)\b/i],
];

function detectRole(text: string, name: string, isProtagonist: boolean): HomerClaim<CharacterRole> {
  if (isProtagonist) return claim('protagonist', 'INFERRED', 'listed as protagonist in story blueprint');
  for (const [role, re] of ROLE_SIGNALS) {
    if (re.test(text)) return claim(role, 'INFERRED', `role signals found near "${name}"`);
  }
  // Look for role words near the character name
  const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const context = new RegExp(`.{0,80}${nameEscaped}.{0,80}`, 'gi').exec(text)?.[0] ?? '';
  for (const [role, re] of ROLE_SIGNALS) {
    if (re.test(context)) return claim(role, 'INFERRED', `role context near "${name}"`);
  }
  return claim('supporting', 'INFERRED', 'default for non-protagonist named character');
}

function detectNarrativeImportance(isProtagonist: boolean, role: CharacterRole): HomerClaim<NarrativeImportance> {
  if (isProtagonist || role === 'antagonist') return claim('primary', 'INFERRED');
  if (role === 'supporting') return claim('supporting', 'INFERRED');
  return claim('minor', 'INFERRED');
}

/** Build character alias list: pronouns + generic references like "the boy". */
function buildAliases(name: string, role: CharacterRole, text: string): string[] {
  const aliases: string[] = [];
  const lower = name.toLowerCase();

  // "the <role>" patterns
  const genderPatterns = /\b(the girl|the boy|the woman|the man|the child|the kid|the teen|the elder|the young woman|the young man)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = genderPatterns.exec(text)) !== null) {
    if (!aliases.includes(m[1].toLowerCase())) aliases.push(m[1].toLowerCase());
  }

  // pronouns (only attach to protagonist/antagonist to avoid over-merging)
  if (role === 'protagonist' || role === 'antagonist') {
    aliases.push('he', 'she', 'they', 'him', 'her', 'them');
  }

  // "the X" where X is based on a trait near the character name
  const descMatch = new RegExp(`${lower}[^.?!]{0,60}`, 'i').exec(text);
  if (descMatch) {
    const youngMatch = /\b(young|teenage|elderly|old)\b/i.exec(descMatch[0]);
    if (youngMatch) aliases.push(`the ${youngMatch[1].toLowerCase()} ${lower}`);
  }

  return [...new Set(aliases)];
}

export function extractCharactersFromBlueprint(blueprint: StoryBlueprint, storyText: string): HomerCharacter[] {
  const characters: HomerCharacter[] = [];
  const seen = new Set<string>();

  function addCharacter(name: string, isProtagonist: boolean, descHint?: string): void {
    if (!name || seen.has(normalizeKey(name))) return;
    seen.add(normalizeKey(name));
    const role = detectRole(storyText, name, isProtagonist);
    const importance = detectNarrativeImportance(isProtagonist, role.value);
    const desc = descHint ?? extractCharacterDescription(name, storyText);
    characters.push({
      id: stableId('char', name),
      name: claim(name, 'EXPLICIT', 'named in story blueprint'),
      role,
      description: claim(desc, desc ? 'INFERRED' : 'UNKNOWN'),
      relationships: [],
      traits: extractCharacterTraits(name, storyText),
      narrativeImportance: importance,
      aliases: buildAliases(name, role.value, storyText),
      userOwned: false,
    });
  }

  addCharacter(blueprint.protagonist.name, true, blueprint.protagonist.motivation ?? undefined);

  for (const sc of blueprint.supportingCharacters) {
    addCharacter(sc.name, false, sc.role ?? undefined);
  }

  // Also scan story text for capitalized names not in blueprint
  const namePattern = /\b([A-Z][a-z]{2,20})\b/g;
  let m: RegExpExecArray | null;
  while ((m = namePattern.exec(storyText)) !== null) {
    const candidate = m[1];
    if (
      !seen.has(normalizeKey(candidate)) &&
      !COMMON_WORDS.has(candidate.toLowerCase())
    ) {
      addCharacter(candidate, false);
    }
  }

  return characters;
}

const COMMON_WORDS = new Set([
  'the', 'and', 'but', 'for', 'nor', 'yet', 'so', 'with', 'into', 'from',
  'this', 'that', 'then', 'when', 'where', 'scene', 'chapter', 'suddenly',
  'finally', 'meanwhile', 'however', 'morning', 'evening', 'night', 'day',
  'later', 'before', 'after', 'first', 'last', 'next', 'each', 'some',
  'there', 'here', 'back', 'away', 'down', 'just', 'over', 'under', 'near',
  'through', 'between', 'their', 'together', 'around', 'behind', 'above',
]);

function extractCharacterDescription(name: string, text: string): string {
  const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${nameEscaped}[^.?!]{0,120}[.?!]`, 'i');
  const match = re.exec(text);
  if (!match) return '';
  return match[0].replace(name, '').replace(/^[^a-zA-Z]+/, '').trim().slice(0, 200);
}

function extractCharacterTraits(name: string, text: string): Array<HomerClaim<string>> {
  const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const context = new RegExp(`.{0,100}${nameEscaped}.{0,100}`, 'gi').exec(text)?.[0] ?? '';
  const TRAIT_WORDS = [
    'brave', 'curious', 'kind', 'clever', 'stubborn', 'shy', 'bold', 'gentle',
    'fierce', 'loyal', 'impulsive', 'wise', 'naive', 'determined', 'scared',
    'young', 'old', 'small', 'tall', 'quick', 'slow', 'quiet', 'loud',
  ];
  return TRAIT_WORDS
    .filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(context))
    .map((t) => claim(t, 'INFERRED', `trait found in text near "${name}"`));
}

// ─── Location extraction ──────────────────────────────────────────────────────

const LOCATION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(in|at|inside|outside|through|across|near|by|around|into|from)\s+(?:the|a|an)\s+([a-z][a-z\s]{2,30})/gi, '$2'],
  [/\b(house|home|school|garden|forest|city|village|road|street|market|park|field|river|ocean|beach|mountain|cave|tower|castle|attic|basement|roof|office|hospital|library|shop)\b/gi, '$0'],
];

export function extractLocationsFromText(text: string, blueprint: StoryBlueprint): HomerLocation[] {
  const locations: HomerLocation[] = [];
  const seen = new Set<string>();

  function addLocation(name: string, provenance: DecisionProvenance, basis?: string): void {
    const key = normalizeKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    locations.push({
      id: stableId('loc', name),
      name: claim(name, provenance, basis),
      description: claim(extractLocationDescription(name, text), 'INFERRED'),
      role: claim(inferLocationRole(name, text), 'INFERRED'),
      environmentalCharacteristics: claim([], 'UNKNOWN'),
      aliases: buildLocationAliases(name, text),
      userOwned: false,
    });
  }

  // From blueprint setting
  if (blueprint.setting) {
    addLocation(blueprint.setting, 'EXPLICIT', 'setting from story blueprint');
  }

  // Pattern-based extraction from text
  const lower = text.toLowerCase();
  for (const [pattern] of LOCATION_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(lower)) !== null) {
      const candidate = m[m.length - 1].trim();
      if (candidate.length > 2 && !COMMON_WORDS.has(candidate)) {
        addLocation(candidate, 'INFERRED', 'pattern-matched in text');
      }
    }
  }

  return locations;
}

function extractLocationDescription(name: string, text: string): string {
  const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`[^.?!]*${nameEscaped}[^.?!]*[.?!]`, 'i');
  return (re.exec(text)?.[0] ?? '').replace(name, '').trim().slice(0, 150);
}

function inferLocationRole(name: string, text: string): string {
  const lower = name.toLowerCase();
  if (/home|house|room|apartment/.test(lower)) return 'home environment';
  if (/school|classroom|library/.test(lower)) return 'learning environment';
  if (/forest|garden|park|field/.test(lower)) return 'natural environment';
  if (/market|shop|store|city|street/.test(lower)) return 'social environment';
  return 'story location';
}

function buildLocationAliases(name: string, text: string): string[] {
  const aliases: string[] = [];
  const lower = name.toLowerCase();
  // "the house" → "the old house" → all map to same location
  const altPattern = new RegExp(`the\\s+(?:old|new|big|small|dark|bright|ancient|modern)\\s+${lower}`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = altPattern.exec(text)) !== null) {
    const alt = m[0].toLowerCase();
    if (!aliases.includes(alt)) aliases.push(alt);
  }
  return aliases;
}

// ─── Object extraction ────────────────────────────────────────────────────────

const IMPORTANT_OBJECT_PATTERNS = [
  /\b(?:finds?|discover(?:s|ed)?|picks?\s+up|holds?|carries?|gives?|receives?|takes?|opens?|reads?|uses?|activates?)\s+(?:the|a|an)\s+([a-z][a-z\s]{1,30})/gi,
];

const OBJECT_IMPORTANCE_SIGNALS = new Set([
  'key', 'letter', 'book', 'map', 'photo', 'photograph', 'ring', 'necklace',
  'compass', 'radio', 'phone', 'watch', 'letter', 'box', 'door', 'mirror',
  'sword', 'weapon', 'potion', 'artifact', 'gem', 'stone', 'crystal',
]);

export function extractObjectsFromText(text: string): HomerObject[] {
  const objects: HomerObject[] = [];
  const seen = new Set<string>();

  function addObject(name: string, importance: 'critical' | 'notable' | 'minor'): void {
    const key = normalizeKey(name);
    if (!key || seen.has(key) || COMMON_WORDS.has(key)) return;
    seen.add(key);
    objects.push({
      id: stableId('obj', name),
      name: claim(name, 'INFERRED', 'object involved in narrative action'),
      description: claim('', 'UNKNOWN'),
      narrativeImportance: claim(importance, 'INFERRED'),
      continuityRequired: claim(importance === 'critical', 'INFERRED'),
    });
  }

  const lower = text.toLowerCase();

  // Primary: action-verb → article → object
  for (const pattern of IMPORTANT_OBJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(lower)) !== null) {
      const candidate = m[1].trim();
      const importance: 'critical' | 'notable' | 'minor' =
        OBJECT_IMPORTANCE_SIGNALS.has(candidate) ? 'critical' : 'notable';
      addObject(candidate, importance);
    }
  }

  // Secondary: scan for known important object words directly in the text.
  // Catches passive constructions like "a strange old radio was hidden beneath a quilt".
  for (const word of OBJECT_IMPORTANCE_SIGNALS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower) && !seen.has(normalizeKey(word))) {
      addObject(word, 'critical');
    }
  }

  return objects;
}

// ─── Beat extraction ──────────────────────────────────────────────────────────

const BEAT_FUNCTION_MAP: Array<[BeatFunction, RegExp]> = [
  ['setup', /\b(setup|introduction|establishes?|begins?|starts?|opening|starts)\b/i],
  ['introduction', /\b(introduce|meets?|encounters?|arrives?|appears?)\b/i],
  ['discovery', /\b(discover(?:s|ies)?|finds?|realizes?|learns?|notices?|uncovers?)\b/i],
  ['decision', /\b(decides?|chooses?|choice|must decide|faced with|options?)\b/i],
  ['confrontation', /\b(confronts?|faces?|fights?|opposes?|clash(?:es)?|challenge)\b/i],
  ['escalation', /\b(escalates?|intensifies?|grows? worse|worsens?|danger increases)\b/i],
  ['reveal', /\b(reveals?|expose(?:s)?|truth|secret|discovers? the truth)\b/i],
  ['consequence', /\b(consequence|result|aftermath|effect|impact|leads? to)\b/i],
  ['resolution', /\b(resolves?|resolution|ending|concludes?|defeats?|succeeds?|wins?|finally)\b/i],
  ['cliffhanger', /\b(cliffhanger|unresolved|to be continued|suddenly|just then|but then|when)\b/i],
];

const STRUCTURAL_POSITION_MAP: Array<[StructuralPosition, number[]]> = [
  ['beginning', [0]],
  ['development', [1, 2]],
  ['escalation', [2, 3]],
  ['climax', [3, 4]],
  ['consequence', [4]],
  ['resolution', [5, 6, 7]],
];

function beatFunctionFor(label: string, description: string): HomerClaim<BeatFunction> {
  const text = `${label} ${description}`.toLowerCase();
  for (const [fn, re] of BEAT_FUNCTION_MAP) {
    if (re.test(text)) return claim(fn, 'INFERRED', `matched "${re.source}" in beat text`);
  }
  return claim('setup', 'INFERRED', 'default function');
}

function structuralPositionFor(ordinal: number, total: number): HomerClaim<StructuralPosition> {
  // Map ordinal (0-indexed) to structural position based on proportional placement
  const relPos = total <= 1 ? 0 : ordinal / (total - 1);
  if (relPos < 0.15) return claim('beginning', 'INFERRED');
  if (relPos < 0.40) return claim('development', 'INFERRED');
  if (relPos < 0.60) return claim('escalation', 'INFERRED');
  if (relPos < 0.75) return claim('climax', 'INFERRED');
  if (relPos < 0.90) return claim('consequence', 'INFERRED');
  return claim('resolution', 'INFERRED');
}

const EMOTIONAL_DIRECTION_BY_BEAT: Record<BeatFunction, string> = {
  setup: 'neutral / anticipation',
  introduction: 'curiosity',
  discovery: 'wonder / unease',
  decision: 'tension',
  confrontation: 'fear / determination',
  escalation: 'dread / urgency',
  reveal: 'shock / realisation',
  consequence: 'grief / relief',
  resolution: 'catharsis / hope',
  cliffhanger: 'suspense',
};

export function extractBeatsFromBlueprint(blueprint: StoryBlueprint): HomerBeat[] {
  const total = blueprint.beats.length;
  return blueprint.beats.map((b, i) => {
    const fn = beatFunctionFor(b.label, b.description);
    const structPos = structuralPositionFor(i, total);
    return {
      id: stableId('beat', `${i}_${b.label}`),
      ordinal: i + 1,
      label: b.label,
      description: claim(b.description, 'INFERRED', 'from story blueprint'),
      function: fn,
      emotionalDirection: claim(
        EMOTIONAL_DIRECTION_BY_BEAT[fn.value] ?? 'neutral',
        'INFERRED',
        `derived from beat function "${fn.value}"`,
      ),
      charactersInvolved: [],
      locationsInvolved: [],
      objectsInvolved: [],
      structuralPosition: structPos,
    };
  });
}

// ─── Structural arc assignment ────────────────────────────────────────────────

export function assignStructuralArc(beats: HomerBeat[]): {
  beginning: string[];
  development: string[];
  escalation: string[];
  climax: string[];
  consequence: string[];
  resolution: string[];
} {
  const arc: Record<StructuralPosition, string[]> = {
    beginning: [],
    development: [],
    escalation: [],
    climax: [],
    consequence: [],
    resolution: [],
  };
  for (const beat of beats) {
    arc[beat.structuralPosition.value].push(beat.id);
  }
  return arc;
}

// ─── Unresolved thread detection ──────────────────────────────────────────────

const THREAD_PATTERNS: Array<[ThreadKind, RegExp]> = [
  ['mystery', /\b(mysteriously?|unknown|secret(?:ly)?|hidden|strange(?:ly)?|inexplicably|no one knew|nobody knows)\b/i],
  ['conflict', /\b(conflict|struggle|fight|battle|oppose(?:s|d)?|resist(?:s|ed)?|against)\b/i],
  ['promise', /\b(promise(?:d|s)?|vow(?:s|ed)?|swear(?:s|swore)?|pledges?)\b/i],
  ['question', /\b(why|how|what happened|who|what is|what was|could it be|wondering|wonders?|asked)\b/i],
  ['unresolved_consequence', /\b(consequence|aftermath|effect|result|impact|because of|due to|leads? to)\b/i],
];

export function extractThreadsFromText(text: string, beats: HomerBeat[]): HomerThread[] {
  const threads: HomerThread[] = [];
  const seen = new Set<string>();
  const sentences = text.match(/[^.?!]+[.?!]+/g) ?? [];

  for (const sentence of sentences) {
    for (const [kind, re] of THREAD_PATTERNS) {
      if (re.test(sentence)) {
        const desc = sentence.trim().slice(0, 160);
        const key = normalizeKey(desc.slice(0, 40));
        if (!seen.has(key)) {
          seen.add(key);
          // Find which beat this sentence most likely belongs to
          const beatId = findBeatForSentence(sentence, beats);
          threads.push({
            id: stableId('thread', key),
            description: claim(desc, 'INFERRED', `"${re.source}" matched in text`),
            kind,
            openedAtBeatId: beatId,
            status: 'open',
          });
          if (threads.length >= 8) return threads;
        }
      }
    }
  }
  return threads;
}

function findBeatForSentence(sentence: string, beats: HomerBeat[]): string | undefined {
  const lower = sentence.toLowerCase();
  for (const beat of beats) {
    if (beat.description.value && lower.includes(beat.description.value.toLowerCase().slice(0, 30))) {
      return beat.id;
    }
  }
  return beats[Math.floor(beats.length / 2)]?.id;
}
