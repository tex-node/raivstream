/**
 * Homer — Semantic cliffhanger detection.
 *
 * Eight cliffhanger types, each with pattern-based detection against
 * beat descriptions and story text. Pure functions — no AI, no DB.
 */

import type { CliffhangerType, HomerBeat, HomerCliffhanger, HomerThread } from './types';

// ─── Type detectors ───────────────────────────────────────────────────────────

interface CliffhangerSignal {
  type: CliffhangerType;
  patterns: RegExp[];
  justification: (match: string) => string;
}

const SIGNALS: CliffhangerSignal[] = [
  {
    type: 'unanswered_revelation',
    patterns: [
      /\b(reveals?|discloses?|uncovers?|exposes?)\b.*\b(but|before|when|just as)\b/i,
      /\b(secret|truth|mystery)\b.*\b(still|yet|remains?|unknown)\b/i,
    ],
    justification: (m) => `revelation is raised but not resolved: "${m.slice(0, 80)}"`,
  },
  {
    type: 'imminent_danger',
    patterns: [
      /\b(dangerous?|threat|peril|doom|trap|ambush|surrounded|cornered|escape|secret)\b.*\b(warn|danger|hold|hidden|knows?)\b/i,
      /\b(danger|threat|peril|doom|trap|ambush|surrounded|cornered|escape)\b/i,
      /\b(about to|moments? from|seconds? away|just before)\b.*\b(attack|strike|collapse|explode|fall)\b/i,
    ],
    justification: (m) => `imminent physical danger signals high stakes: "${m.slice(0, 80)}"`,
  },
  {
    type: 'discovery',
    patterns: [
      /\b(finds?|discover(?:s|ies)?|stumbles?\s+upon|comes?\s+across)\b.*\b(strange|mysterious|unexpected|unknown|hidden|ancient)\b/i,
      // Also fire when a character discovers anything significant (voice, secret, message)
      /\b(discovers?|finds?|uncovers?)\b.{0,60}\b(voice|message|truth|secret|recording|letter|note)\b/i,
    ],
    justification: (m) => `discovery of something significant without resolution: "${m.slice(0, 80)}"`,
  },
  {
    type: 'decision',
    patterns: [
      /\b(must decide|faces?\s+a\s+choice|cannot\s+decide|torn\s+between|two\s+paths?|crossroads)\b/i,
      /\b(should|would|could)\b.*\b(but|or|never)\b.*\?/i,
    ],
    justification: (m) => `character faces an unresolved decision: "${m.slice(0, 80)}"`,
  },
  {
    type: 'unexpected_arrival',
    patterns: [
      /\b(suddenly|out\s+of\s+nowhere|unexpectedly|without\s+warning)\b.*\b(appear(?:s|ed)?|arrive(?:s|d)?|enters?|walks?\s+in)\b/i,
      /\b(a\s+figure|a\s+stranger|a\s+voice|footsteps?)\b.*\b(appears?|emerges?|calls?)\b/i,
    ],
    justification: (m) => `unexpected arrival creates unresolved tension: "${m.slice(0, 80)}"`,
  },
  {
    type: 'unresolved_consequence',
    patterns: [
      /\b(consequence|aftermath|result)\b.*\b(unknown|uncertain|unclear|remains?)\b/i,
      /\b(what\s+would\s+happen|what\s+comes?\s+next|nobody\s+knew|no\s+one\s+could\s+know)\b/i,
    ],
    justification: (m) => `a prior action's consequence is left unresolved: "${m.slice(0, 80)}"`,
  },
  {
    type: 'new_mystery',
    patterns: [
      /\b(mysterious?|inexplicably?|strangely?|without\s+explanation|no\s+one\s+knew|how\s+could\s+it)\b/i,
      /\b(how|why|who|what)\b.{0,40}\?.*\b(nobody|no\s+one|without\s+answer)\b/i,
    ],
    justification: (m) => `new unanswered mystery introduced: "${m.slice(0, 80)}"`,
  },
  {
    type: 'reversal',
    patterns: [
      /\b(but\s+then|however|suddenly|to\s+(?:everyone|their|her|his)\s+surprise|unexpected(?:ly)?)\b.*\b(wrong|mistake|betrayed?|lied?|turned)\b/i,
      /\b(everything\s+changed?|nothing\s+would\s+be\s+the\s+same|realiz(?:ed?|ing)\s+too\s+late)\b/i,
    ],
    justification: (m) => `dramatic reversal disrupts the expected outcome: "${m.slice(0, 80)}"`,
  },
];

// ─── Detection ────────────────────────────────────────────────────────────────

function detectBeatCliffhangers(
  beat: HomerBeat,
  threads: HomerThread[],
): HomerCliffhanger[] {
  const desc = beat.description.value ?? '';
  const results: HomerCliffhanger[] = [];
  const seen = new Set<CliffhangerType>();

  for (const signal of SIGNALS) {
    if (seen.has(signal.type)) continue;
    for (const pattern of signal.patterns) {
      if (pattern.test(desc)) {
        const matchText = pattern.exec(desc)?.[0] ?? desc;
        const relatedThreadIds = threads
          .filter((t) => t.status === 'open')
          .map((t) => t.id);
        results.push({
          beatId: beat.id,
          type: signal.type,
          description: desc.slice(0, 160),
          semanticJustification: signal.justification(matchText),
          relatedThreadIds,
        });
        seen.add(signal.type);
        break;
      }
    }
  }

  // Beat-function fallback: certain beat functions in later story positions always signal cliffhangers
  const CLIFFHANGER_BEAT_FUNCTIONS: Record<string, CliffhangerType> = {
    cliffhanger: 'unanswered_revelation',
    confrontation: 'imminent_danger',
    escalation: 'unresolved_consequence',
    reveal: 'unanswered_revelation',
  };
  const fnType = CLIFFHANGER_BEAT_FUNCTIONS[beat.function.value];
  if (fnType && !seen.has(fnType)) {
    results.push({
      beatId: beat.id,
      type: fnType,
      description: desc.slice(0, 160),
      semanticJustification: `Beat function "${beat.function.value}" signals ${fnType}`,
      relatedThreadIds: threads.filter((t) => t.status === 'open').map((t) => t.id),
    });
    seen.add(fnType);
  }

  return results;
}

export function identifyCliffhangers(
  beats: HomerBeat[],
  threads: HomerThread[],
  storyText: string,
): HomerCliffhanger[] {
  const cliffhangers: HomerCliffhanger[] = [];
  const seenBeatTypes = new Set<string>();

  // Check each beat — focus on the last third of the story for most signals
  const total = beats.length;
  for (let i = 0; i < total; i++) {
    const beat = beats[i];
    if (!beat) continue;

    // Weight later beats more heavily for cliffhanger signals
    const isLaterBeat = i >= Math.floor(total * 0.5);
    const isLastBeat = i === total - 1;

    if (isLastBeat || isLaterBeat || beat.function.value === 'cliffhanger') {
      const detected = detectBeatCliffhangers(beat, threads);
      for (const c of detected) {
        const key = `${c.beatId}:${c.type}`;
        if (!seenBeatTypes.has(key)) {
          seenBeatTypes.add(key);
          cliffhangers.push(c);
        }
      }
    }
  }

  // Also check the whole story text for story-level cliffhanger signals on the last beat
  const lastBeat = beats[total - 1];
  if (lastBeat) {
    for (const signal of SIGNALS) {
      for (const pattern of signal.patterns) {
        const lower = storyText.slice(-400); // last 400 chars
        if (pattern.test(lower)) {
          const key = `${lastBeat.id}:${signal.type}`;
          if (!seenBeatTypes.has(key)) {
            seenBeatTypes.add(key);
            cliffhangers.push({
              beatId: lastBeat.id,
              type: signal.type,
              description: storyText.slice(-200),
              semanticJustification: `Story ending contains ${signal.type} signal`,
              relatedThreadIds: threads.filter((t) => t.status === 'open').map((t) => t.id),
            });
          }
          break;
        }
      }
    }
  }

  return cliffhangers;
}
