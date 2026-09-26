import type {
  StoryIntelligenceProvider,
  PlanStoryInput,
  EnhanceNarrativeInput,
  DirectScenesInput,
  ClassifyContentInput,
  PlanEducationInput,
  StoryBlueprint,
  DirectedScene,
  ContentType,
  EducationalContract,
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

// Returns true when the topic is a regular English plural (ends in 's', not -ss/-us/-is).
function looksPlural(topic: string): boolean {
  const lower = topic.toLowerCase();
  if (lower.endsWith('ss') || lower.endsWith('us') || lower.endsWith('is')) return false;
  return lower.endsWith('s') && lower.length > 3;
}

// Produces grammatically correct educational question keys for a topic.
function educationalKeyConcepts(topic: string): string[] {
  const plural = looksPlural(topic);
  const startsWithArticle = /^(a |an |the )/i.test(topic);
  const article = startsWithArticle ? '' : plural ? '' : /^[aeiou]/i.test(topic) ? 'an ' : 'a ';
  const q1 = plural ? `What are ${topic}?` : `What is ${article}${topic}?`;
  return [q1, `How do ${topic} work?`, `Types of ${topic}`];
}

// Topic-specific visual teaching strategy — names specific educational examples, never luxury imagery.
function visualTeachingStrategyFor(topic: string): string {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const map: Record<string, string> = {
    ships: 'Show labeled diagrams of cargo ships, container ships, ferries, research vessels, and fishing boats. Highlight structural parts: hull, deck, engine room, and bridge. Educational use only — exclude commercial, promotional, or recreational luxury vessel imagery.',
    boats: 'Show illustrations of rowboats, kayaks, sailboats, and fishing boats in natural settings. Label oars, sail, keel, and hull. Educational use only — exclude promotional or luxury imagery.',
    fish: 'Show clear underwater illustrations of salmon, tuna, clownfish, and sharks in natural habitats. Label fins, gills, and scales. Educational use only — exclude commercial aquarium imagery.',
    birds: 'Show realistic illustrations of eagles, penguins, hummingbirds, and owls in natural habitats. Label wings, beak, and talons. Educational use only — exclude pet-store or commercial imagery.',
    trees: 'Show labeled tree diagrams — oak, pine, apple, and tropical palms. Label roots, trunk, branches, and leaves. Educational use only — exclude commercial logging or landscaping imagery.',
    insects: 'Show magnified illustrations of bees, ants, butterflies, and beetles with labeled body parts. Show natural habitats. Educational use only — exclude pest-control or commercial imagery.',
    water: 'Show the water cycle with labeled diagrams of rain, rivers, lakes, glaciers, and oceans. Educational use only — exclude bottled-water or commercial imagery.',
    weather: 'Show simple labeled weather diagrams — clouds, rainfall, sun, snow, and wind. Educational use only — exclude insurance or disaster-commerce imagery.',
    space: 'Show labeled diagrams of planets, stars, the Moon, rockets, and astronauts in space. Use NASA-style imagery. Educational use only — exclude space-tourism commercial imagery.',
    animals: 'Show realistic illustrations of diverse animals — mammals, reptiles, birds, fish — in natural habitats. Label body parts. Educational use only — exclude zoo-commercial or pet-store imagery.',
    plants: 'Show labeled plant diagrams with roots, stem, leaves, flowers, and seeds. Show pollination and growth stages. Educational use only — exclude commercial gardening imagery.',
  };
  return map[k] ?? `Show real objects and clearly labeled educational diagrams illustrating ${topic}. Educational use only — exclude luxury, commercial, or advertising imagery.`;
}

// Topic-specific real-world examples for child audiences.
function educationalExamplesFor(topic: string): string[] {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const map: Record<string, string[]> = {
    ships: [
      'A cargo ship carrying steel containers across the Atlantic Ocean',
      'A ferry carrying families between two islands',
      'A research vessel exploring the deep sea',
    ],
    boats: ['A rowboat on a calm lake', 'A sailboat using wind power', 'A kayak paddling down a river'],
    fish: ['A salmon swimming upstream to lay eggs', 'A clownfish living among sea anemone', 'A tuna swimming in a school of thousands'],
    birds: ['An eagle soaring over mountain peaks', 'A penguin swimming gracefully underwater', 'A hummingbird hovering beside a flower'],
    trees: ['An oak tree providing shade in a park', 'A pine tree keeping its needles through winter', 'An apple tree producing fruit in autumn'],
    insects: ['Bees collecting nectar and making honey', 'Ants building huge underground colonies', 'A butterfly emerging from its chrysalis'],
  };
  return map[k] ?? [`A common everyday example of ${topic}`];
}

// Child-directed mid-scene narration sentence — teaches the concept, not just describes.
function childDirectedNarrationFor(topic: string, concept: string): string {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const topicSentences: Record<string, string> = {
    ships: 'Ships come in many kinds — cargo ships carry goods, ferries carry passengers, and research vessels explore the deep ocean.',
    boats: 'Boats can be big or small — rowboats use oars, sailboats use the wind, and motorboats use an engine to move.',
    fish: 'Fish live all over the world — in oceans, rivers, and lakes — and come in thousands of amazing shapes and colours.',
    birds: 'Birds come in amazing shapes — eagles soar high, penguins swim underwater, and hummingbirds hover beside flowers.',
    trees: 'Trees give us oxygen to breathe, food to eat, and homes for many animals — they are vital to life on Earth.',
    insects: 'Insects are all around us! Bees make honey, ants build underground cities, and butterflies help flowers grow.',
    water: 'Water falls as rain, flows in rivers, fills the oceans, and turns to ice at the poles — it is always moving!',
    weather: 'Weather changes every day — the sun warms us, clouds bring rain, wind moves the air, and snow falls in winter.',
    space: 'Space is enormous! Our Sun is a star, planets orbit it, and beyond our solar system there are billions more suns.',
    animals: 'Animals live in every corner of Earth — in icy tundras, hot deserts, deep oceans, and dense rainforests.',
  };
  const example = topicSentences[k] ?? `Here is an interesting example of how ${topic} work in our world.`;
  const intro = concept.endsWith('?') ? `${concept} ` : `Let's explore: ${concept.toLowerCase()}! `;
  return `${intro}${example}`;
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
    const count = Math.min(input.sceneCount, 6);
    const contract = input.educationalContract;

    if (contract) {
      const topic = contract.topic;
      const teachingRoles: Array<import('./types').TeachingRole> = [
        'INTRODUCTION', 'EXPLANATION', 'EXAMPLE', 'DEMONSTRATION', 'COMPARISON', 'REINFORCEMENT', 'RECAP',
      ];
      return contract.sceneProgression.slice(0, count).map((purpose, i) => {
        const concept = contract.keyConcepts[i] ?? contract.keyConcepts[contract.keyConcepts.length - 1] ?? topic;
        const role = teachingRoles[Math.min(i, teachingRoles.length - 1)];
        const narrationText = i === 0
          ? `Did you know? ${titleCase(topic)} are fascinating! ${contract.learningObjective}`
          : i === count - 1 && contract.recapIncluded
            ? `Amazing work! Today we learned about ${topic}: ${contract.keyConcepts.slice(0, 3).join('; ')}. You are now a ${topic} expert!`
            : childDirectedNarrationFor(topic, concept);
        return {
          version: 'scene_director_v1' as const,
          ordinal: i + 1,
          title: purpose,
          storyBeat: concept,
          dramaticPurpose: `Teach: ${concept}`,
          characters: [],
          action: `Show ${concept} visually — ${contract.visualTeachingStrategy}`,
          mood: 'curious',
          learningObjective: contract.learningObjective,
          teachingConcept: concept,
          teachingRole: role,
          visualTeachingRequirement: `${contract.visualTeachingStrategy} — specifically demonstrate ${concept}`,
          narrationText,
          antiCommercialNote: contract.antiCommercialTopics.length > 0
            ? `Avoid: ${contract.antiCommercialTopics.slice(0, 3).join(', ')}`
            : undefined,
        };
      });
    }

    const hints = input.existingSceneHints ?? [];
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

  async classifyContent(input: ClassifyContentInput): Promise<ContentType> {
    const idea = input.idea.toLowerCase();
    if (/\b(learn|teach|explain|how does|what is|let'?s talk about|facts about|science of|history of|why do|why does)\b/.test(idea)) {
      return 'EDUCATIONAL';
    }
    if (/\b(story|once upon|adventure|fairy tale|princess|dragon|hero|quest)\b/.test(idea)) {
      return 'STORY';
    }
    if (/\b(documentary|history of|the life of|biography|real story)\b/.test(idea)) {
      return 'DOCUMENTARY';
    }
    if (/\b(buy|shop|product|brand|sale|discount|service)\b/.test(idea)) {
      return 'COMMERCIAL';
    }
    return 'ENTERTAINMENT';
  }

  async planEducation(input: PlanEducationInput): Promise<EducationalContract> {
    const topic = input.idea.replace(/^(let'?s talk about|learn about|explain|how does|what is)\s+/i, '').trim();
    const isKids = input.audienceMode === 'KIDS';
    const scenes = Array.from({ length: Math.min(input.sceneCount, 6) }, (_, i) => {
      const labels = ['Introduction', 'Core concept', 'Example', 'How it works', 'Why it matters', 'Recap'];
      return labels[i] ?? `Scene ${i + 1}`;
    });

    return {
      version: 'education_contract_v1',
      topic,
      targetAge: isKids ? '3–12 years' : 'all ages',
      learningObjective: `You will learn about the amazing world of ${topic} and discover how they work!`,
      keyConcepts: educationalKeyConcepts(topic),
      vocabularyLevel: isKids ? 'very_simple' : 'simple',
      explanationStrategy: `Use simple words and relatable examples to explain ${topic} step by step.`,
      examplesToUse: educationalExamplesFor(topic),
      visualTeachingStrategy: visualTeachingStrategyFor(topic),
      narrationRequired: true,
      sceneProgression: scenes,
      recapIncluded: true,
      antiCommercialTopics: ['luxury goods', 'brand logos', 'advertisements', 'commercial products', 'aspirational lifestyle imagery'],
    };
  }
}
