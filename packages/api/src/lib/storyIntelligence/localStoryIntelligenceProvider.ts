import type {
  StoryIntelligenceProvider,
  PlanStoryInput,
  EnhanceNarrativeInput,
  DirectScenesInput,
  StoryBlueprint,
  DirectedScene,
} from './types';

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function inferProtagonistName(idea: string): string {
  const named = idea.match(/\b([A-Z][a-zA-Z'-]{1,40})\s+is\s+(?:a|an|the)\b/);
  if (named) return named[1];
  const subjectMatch = idea.match(/\b(a|an|the)\s+([a-zA-Z'-]+)/i);
  const subject = subjectMatch?.[2] ?? idea.split(/\s+/)[0] ?? 'Hero';
  return titleCase(subject);
}

export class LocalStoryIntelligenceProvider implements StoryIntelligenceProvider {
  readonly name = 'local-fallback';

  async planStory(input: PlanStoryInput): Promise<StoryBlueprint> {
    const name = inferProtagonistName(input.idea);
    const toneAnswer = input.answers.find((a) => /feel|tone/i.test(a.questionText))?.selectedAnswer ?? 'warm';
    const endAnswer = input.answers.find((a) => /end/i.test(a.questionText))?.selectedAnswer ?? 'happy';

    return {
      version: 'story_blueprint_v1',
      premise: `${name} goes on a small adventure and learns something important.`,
      genre: 'children\'s adventure',
      tone: toneAnswer.toLowerCase(),
      theme: 'courage, friendship, and kindness',
      audience: input.audienceMode === 'KIDS' ? 'children ages 4-12' : 'general family',
      protagonist: {
        name,
        goal: 'complete the adventure and get home safely',
        motivation: 'curiosity and a desire to help',
      },
      supportingCharacters: [],
      setting: 'a familiar neighbourhood or community',
      conflict: 'a small unexpected problem that requires help from others',
      stakes: 'making new friends and learning a lesson',
      emotionalArc: `starts uncertain, grows more confident, ends ${endAnswer.toLowerCase()}`,
      beats: [
        { label: 'Beginning', description: `${name} starts the day at home with a new idea.` },
        { label: 'First step', description: `${name} steps out and meets the first challenge.` },
        { label: 'Helper', description: 'A friend or helper appears and they team up.' },
        { label: 'Key moment', description: 'The main challenge arrives and must be faced.' },
        { label: 'Resolution', description: `${name} solves the problem with kindness and courage.` },
        { label: 'Ending', description: `Everyone celebrates and ${name} goes home happy.` },
      ],
      continuityRules: [
        `${name} is the main character throughout all scenes.`,
        'Preserve the setting established in the opening.',
      ],
    };
  }

  async enhanceNarrative(input: EnhanceNarrativeInput): Promise<string> {
    return input.storyBody;
  }

  async directScenes(input: DirectScenesInput): Promise<DirectedScene[]> {
    const name = input.blueprint.protagonist.name;
    const hints = input.existingSceneHints ?? [];
    const count = Math.min(input.sceneCount, 6);

    if (hints.length >= count) {
      return hints.slice(0, count).map((hint, i) => ({
        version: 'scene_director_v1' as const,
        ordinal: i + 1,
        title: hint.title,
        storyBeat: input.blueprint.beats[i]?.label ?? `Scene ${i + 1}`,
        dramaticPurpose: input.blueprint.beats[i]?.description ?? hint.description,
        location: hint.locationType,
        characters: [name],
        action: hint.description,
        mood: hint.mood,
      }));
    }

    return input.blueprint.beats.slice(0, count).map((beat, i) => ({
      version: 'scene_director_v1' as const,
      ordinal: i + 1,
      title: beat.label,
      storyBeat: beat.label,
      dramaticPurpose: beat.description,
      characters: [name],
      action: beat.description,
    }));
  }
}
