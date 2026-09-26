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

// Age-group resolution from Q&A answers — drives vocabulary level and targetAge string.
function resolveAgeGroup(
  answers: Array<{ questionText: string; selectedAnswer: string }>,
  audienceMode: string,
): { targetAge: string; vocabularyLevel: EducationalContract['vocabularyLevel'] } {
  const ageAnswer = answers.find((a) => /age|old|year|grade|level/i.test(a.questionText))?.selectedAnswer ?? '';
  if (/\b(5|6|7|preschool|kindergarten|young(er)?)\b/i.test(ageAnswer)) {
    return { targetAge: '5–7 years', vocabularyLevel: 'very_simple' };
  }
  if (/\b(8|9|10|second|third|fourth)\b/i.test(ageAnswer)) {
    return { targetAge: '8–10 years', vocabularyLevel: 'simple' };
  }
  if (/\b(11|12|13|middle|fifth|sixth|seventh)\b/i.test(ageAnswer)) {
    return { targetAge: '11–13 years', vocabularyLevel: 'moderate' };
  }
  if (audienceMode === 'KIDS') return { targetAge: '5–10 years', vocabularyLevel: 'simple' };
  return { targetAge: 'all ages', vocabularyLevel: 'moderate' };
}

// Age-adapted explanation strategy.
function explanationStrategyFor(vocabularyLevel: EducationalContract['vocabularyLevel']): string {
  switch (vocabularyLevel) {
    case 'very_simple': return 'Use 2–3 word labels, picture-first explanations, and one simple idea per scene. Compare to familiar things the child already knows.';
    case 'simple': return 'Use short sentences, relatable everyday examples, and step-by-step explanations. Introduce one new word per scene with a plain-English definition.';
    case 'moderate': return 'Use clear structured explanations with cause-and-effect reasoning. Introduce terminology with definitions in context. Use comparisons and diagrams.';
    case 'advanced': return 'Use precise terminology and multi-step reasoning. Build on prior knowledge within the video. Use classification, analysis, and evidence-based claims.';
  }
}

// Age-adapted, topic-specific learning objective.
function educationalLearningObjective(topic: string, targetAge: string): string {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const isYoung = targetAge.startsWith('5');
  const isOlder = targetAge.startsWith('11');
  const objectives: Record<string, [string, string, string]> = {
    ships: [
      'You will discover different types of ships and learn why ships can float on water!',
      'You will learn how ships are built, how buoyancy keeps them afloat, and the roles ships play in moving goods around the world.',
      'You will explore the science of buoyancy and displacement, the classification of vessels by function, and how maritime trade connects the global economy.',
    ],
    boats: [
      'You will discover all kinds of boats and learn how each one moves through the water!',
      'You will learn how different boats are powered — oars, wind, or engines — and when each type is used.',
      'You will examine the principles of hull design, propulsion methods, and the physics of buoyancy that make watercraft possible.',
    ],
    fish: [
      'You will meet amazing fish from all over the world and learn where they live!',
      'You will learn how fish breathe underwater, how they swim, and the incredible variety of fish on Earth.',
      'You will investigate fish anatomy, habitat adaptation, and the evolutionary diversity of aquatic vertebrates.',
    ],
    birds: [
      'You will meet amazing birds from all over the world — some fly, some swim, some do both!',
      'You will learn how birds fly, what makes them special, and discover the incredible variety of birds on Earth.',
      'You will investigate avian anatomy, flight mechanics, evolutionary diversity, and the ecological roles birds fill.',
    ],
    trees: [
      'You will discover what trees do for us and for animals every day!',
      'You will learn how trees make food from sunlight, why they matter for the environment, and the different types of trees.',
      'You will explore the biology of photosynthesis, the ecological role of forests, and the classification of major tree types.',
    ],
    insects: [
      'You will meet tiny but amazing insects and discover what they do in the world!',
      'You will learn what makes an insect an insect, why they are important, and how they help the environment.',
      'You will examine insect anatomy, metamorphosis, ecological services like pollination and decomposition, and their evolutionary success.',
    ],
    space: [
      'You will blast off into space and discover planets, stars, and rockets!',
      'You will learn about the planets in our solar system, what makes stars shine, and how humans explore space.',
      'You will investigate stellar evolution, planetary formation, gravitational mechanics, and the technology of space exploration.',
    ],
    water: [
      'You will discover where water comes from and where it goes in the amazing water cycle!',
      'You will learn about the water cycle — how water moves from rain to rivers to oceans and back again.',
      'You will examine the hydrological cycle in detail, including evaporation, condensation, precipitation, and the role of water in sustaining life.',
    ],
    animals: [
      'You will meet animals from all over the world and discover where they live!',
      'You will learn how animals adapt to different environments, from icy tundras to hot deserts.',
      'You will investigate adaptation, natural selection, and the diversity of animal phyla across Earth\'s biomes.',
    ],
  };
  const obj = objectives[k];
  if (obj) return isYoung ? obj[0] : isOlder ? obj[2] : obj[1];
  return isYoung
    ? `You will discover amazing things about ${topic} and learn how they work!`
    : isOlder
    ? `You will understand the key principles of ${topic}, including how and why they work the way they do.`
    : `You will learn about ${topic}, discover how it works, and understand why it matters.`;
}

// Hook narration — short, curiosity-first, question-led. Designed for child attention.
function hookNarrationFor(topic: string, vocabularyLevel: EducationalContract['vocabularyLevel']): string {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const hooks: Record<string, Record<EducationalContract['vocabularyLevel'], string>> = {
    ships: {
      very_simple: 'Have you seen a huge ship? Ships are GIANT! How do ships float? Let\'s find out!',
      simple: 'Have you ever wondered how ships as big as buildings can float on water? Today we find out!',
      moderate: 'Cargo ships weigh as much as 200,000 elephants — yet they float. How? That is what we are about to discover about ships.',
      advanced: 'Steel is eight times denser than water — yet ships weighing 200,000 tonnes sail the ocean. The secret lies in buoyancy and displacement.',
    },
    birds: {
      very_simple: 'Birds can fly! Some swim too! Let\'s meet amazing birds from all over the world!',
      simple: 'Birds come in thousands of shapes and sizes — from tiny hummingbirds to huge eagles. Let\'s explore them!',
      moderate: 'From birds that swim to birds that cannot fly at all, the diversity of the avian world is extraordinary. Let\'s dive in.',
      advanced: 'The class Aves includes more than 10,000 known species — and new ones are still being discovered. What makes a bird a bird?',
    },
    fish: {
      very_simple: 'Fish live in water! Some are tiny. Some are HUGE! Let\'s see them all!',
      simple: 'There are more kinds of fish than all other backboned animals combined! Let\'s explore their world.',
      moderate: 'Fish have been evolving for 500 million years — far longer than dinosaurs. Their diversity is staggering.',
      advanced: 'With over 34,000 known species, fish represent more than half of all vertebrate biodiversity. Today we investigate what drives this extraordinary variety.',
    },
    space: {
      very_simple: 'Space is SO big! There are stars and planets everywhere! Let\'s blast off!',
      simple: 'Our Sun is just one star among hundreds of billions in our galaxy alone. Let\'s explore what else is out there!',
      moderate: 'The observable universe contains an estimated two trillion galaxies. How did it all begin — and where does it end?',
      advanced: 'The observable universe spans 93 billion light-years. The laws of physics that govern it can be written on a single page.',
    },
  };
  const topicHooks = hooks[k];
  if (topicHooks) return topicHooks[vocabularyLevel];
  const generic: Record<EducationalContract['vocabularyLevel'], string> = {
    very_simple: `Did you know? ${titleCase(topic)} are really cool! Let's learn all about them!`,
    simple: `Have you ever wondered about ${topic}? Today we are going to find out some amazing things!`,
    moderate: `${titleCase(topic)} might seem ordinary — but look closer and you will find something remarkable. Let's investigate.`,
    advanced: `${titleCase(topic)} reward careful examination. Today we explore the principles that make them work.`,
  };
  return generic[vocabularyLevel];
}

// HOOK→INTRO→CONCEPT→EXAMPLE→SECOND CONCEPT→APPLICATION→RECAP structure (F3.6).
function educationalSceneProgression(sceneCount: number): string[] {
  const full = [
    'Hook: grab attention with a surprising question or fact',
    'Introduction: what we are learning and why it matters',
    'Core concept: the main idea explained clearly',
    'Example: a real-world case that shows the concept',
    'Second concept: a related idea that builds on the first',
    'Application: how this knowledge is used in the real world',
    'Recap: review all key ideas and celebrate learning',
  ];
  if (sceneCount >= full.length) return full;
  const selected: string[] = [full[0]!];
  const middle = full.slice(1, -1);
  const needed = sceneCount - 2;
  selected.push(...middle.slice(0, Math.max(needed, 0)));
  selected.push(full[full.length - 1]!);
  return selected;
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

// Child-directed mid-scene narration — adapts sentence length to vocabulary level.
function childDirectedNarrationFor(
  topic: string,
  concept: string,
  vocabularyLevel: EducationalContract['vocabularyLevel'],
): string {
  const k = topic.toLowerCase().replace(/\s+/g, '');
  const byVocab: Record<string, Record<EducationalContract['vocabularyLevel'], string>> = {
    ships: {
      very_simple: 'Big ships carry things. Ferries carry people. Research ships explore the ocean.',
      simple: 'Ships come in many kinds — cargo ships carry goods, ferries carry passengers, and research vessels explore the deep ocean.',
      moderate: 'Ships are classified by function: container ships maximise cargo, ferries transport passengers, research vessels carry scientists, and tankers move liquids.',
      advanced: 'Vessels are classified by purpose and hull design: container ships prioritise cargo density, tankers contain pressurised holds, and research vessels carry specialised scientific equipment.',
    },
    boats: {
      very_simple: 'Some boats use oars. Some use wind. Some use an engine.',
      simple: 'Boats can be big or small — rowboats use oars, sailboats use the wind, and motorboats use an engine to move.',
      moderate: 'Watercraft range from simple oar-powered rowboats to wind-driven sailboats and engine-powered motorboats, each suited to different conditions.',
      advanced: 'Watercraft propulsion methods determine performance characteristics: oar-driven displacement hulls maximise efficiency at low speeds, sail rigs harness wind energy, and internal combustion or electric motors enable high-speed planing.',
    },
    fish: {
      very_simple: 'Fish have fins and gills. They swim in the water.',
      simple: 'Fish live all over the world — in oceans, rivers, and lakes — and come in thousands of amazing shapes and colours.',
      moderate: 'Fish inhabit every aquatic environment, using fins for movement, gills for breathing underwater, and scales for protection.',
      advanced: 'Actinopterygii dominate aquatic ecosystems through specialised adaptations: gas-bladder buoyancy control, lateral-line mechanoreception, and diverse feeding morphologies.',
    },
    birds: {
      very_simple: 'Eagles fly high. Penguins swim. Hummingbirds hover.',
      simple: 'Birds come in amazing shapes — eagles soar high, penguins swim underwater, and hummingbirds hover beside flowers.',
      moderate: 'Birds have evolved to fill different ecological roles: eagles soar on thermals, penguins use modified wings for swimming, and hummingbirds hover with rapid wing beats.',
      advanced: 'Avian morphology reflects ecological specialisation: raptors exploit thermal uplift with broad aspect-ratio wings, penguins underwent wing-bone neoteny for aquatic propulsion, and hummingbirds achieve sustained hover through asymmetric downstroke and upstroke lift.',
    },
    trees: {
      very_simple: 'Trees make air. Animals live in them. We eat their fruit.',
      simple: 'Trees give us oxygen to breathe, food to eat, and homes for many animals — they are vital to life on Earth.',
      moderate: 'Trees produce oxygen through photosynthesis, sequester carbon dioxide, provide habitat, and support ecosystems as foundation species.',
      advanced: 'Trees function as ecosystem engineers: photosynthesis drives oxygen production and carbon sequestration, mycorrhizal root networks enable nutrient sharing, and complex canopy structure supports multi-trophic food webs.',
    },
    insects: {
      very_simple: 'Bees make honey. Ants build underground. Butterflies help flowers.',
      simple: 'Insects are all around us! Bees make honey, ants build underground cities, and butterflies help flowers grow.',
      moderate: 'Insects perform essential ecosystem services: bees pollinate flowering plants, ants aerate soil and disperse seeds, and butterflies are both pollinators and prey for larger animals.',
      advanced: 'Insects drive critical ecosystem services: hymenopteran pollinators facilitate 75% of angiosperm reproduction, eusocial formicids are primary soil engineers, and lepidopteran species serve as keystone prey in insectivore food webs.',
    },
    water: {
      very_simple: 'Rain falls. It goes to rivers. Rivers go to the ocean.',
      simple: 'Water falls as rain, flows in rivers, fills the oceans, and turns to ice at the poles — it is always moving!',
      moderate: 'The water cycle moves water continuously through evaporation from oceans and lakes, condensation into clouds, precipitation as rain or snow, and runoff back to the sea.',
      advanced: 'The hydrological cycle is driven by solar energy: surface-water evaporation removes latent heat, atmospheric moisture undergoes adiabatic condensation, precipitation returns water to surface and groundwater reservoirs.',
    },
    weather: {
      very_simple: 'The sun warms us. Clouds bring rain. Wind moves the air.',
      simple: 'Weather changes every day — the sun warms us, clouds bring rain, wind moves the air, and snow falls in winter.',
      moderate: 'Weather is caused by uneven solar heating, which creates air pressure differences that drive wind, cloud formation, and precipitation.',
      advanced: 'Atmospheric dynamics arise from differential insolation: pressure gradients drive Coriolis-deflected geostrophic winds, convective instability generates cumulonimbus cells, and dewpoint temperature determines precipitation phase.',
    },
    space: {
      very_simple: 'The Sun is a star. Planets go around it. There are billions of stars.',
      simple: 'Space is enormous! Our Sun is a star, planets orbit it, and beyond our solar system there are billions more suns.',
      moderate: 'Our solar system contains eight planets orbiting the Sun. The Sun is one of about 200 billion stars in the Milky Way galaxy.',
      advanced: 'Our solar system formed 4.6 Gya from a proto-planetary disc; the Sun — a G2V main-sequence star — fuses hydrogen at its core, while planetary orbits are maintained by the gravitational equilibrium between centripetal acceleration and solar attraction.',
    },
    animals: {
      very_simple: 'Animals live in cold places. Hot places. Deep oceans. Dense forests.',
      simple: 'Animals live in every corner of Earth — in icy tundras, hot deserts, deep oceans, and dense rainforests.',
      moderate: 'Animals have evolved extraordinary adaptations to survive in extreme environments, from thick fur in polar regions to water-conserving metabolism in deserts.',
      advanced: 'Metazoan life has colonised every biome through morphological and physiological specialisation: endothermy enables polar survival, cutaneous desiccation resistance enables xeric colonisation, and bioluminescent prey attraction enables hadal foraging.',
    },
  };
  const byTopic = byVocab[k];
  const example = byTopic
    ? byTopic[vocabularyLevel]
    : vocabularyLevel === 'very_simple'
    ? `${titleCase(topic)} are interesting! Let's see how they work.`
    : `Here is an interesting example of how ${topic} work in our world.`;
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
    const count = Math.min(input.sceneCount, 7);
    const contract = input.educationalContract;

    if (contract) {
      const topic = contract.topic;
      const vocabLevel = contract.vocabularyLevel;
      const teachingRoles: Array<import('./types').TeachingRole> = [
        'HOOK', 'INTRODUCTION', 'EXPLANATION', 'EXAMPLE', 'DEMONSTRATION', 'COMPARISON', 'REINFORCEMENT', 'RECAP',
      ];
      return contract.sceneProgression.slice(0, count).map((purpose, i) => {
        const concept = contract.keyConcepts[i] ?? contract.keyConcepts[contract.keyConcepts.length - 1] ?? topic;
        const isFirst = i === 0;
        const isLast = i === count - 1;
        const role = isLast ? 'RECAP' : teachingRoles[Math.min(i, teachingRoles.length - 1)];
        let narrationText: string;
        if (isFirst) {
          narrationText = hookNarrationFor(topic, vocabLevel);
        } else if (isLast && contract.recapIncluded) {
          const recapConcepts = contract.keyConcepts.slice(0, 3).join('; ');
          narrationText = vocabLevel === 'very_simple'
            ? `Great job! We learned about ${topic}! We saw ${contract.keyConcepts.slice(0, 2).join(' and ')}. You are amazing!`
            : `Amazing work! Today we learned about ${topic}: ${recapConcepts}. You are now a ${topic} expert!`;
        } else {
          narrationText = childDirectedNarrationFor(topic, concept, vocabLevel);
        }
        return {
          version: 'scene_director_v1' as const,
          ordinal: i + 1,
          title: purpose,
          storyBeat: concept,
          dramaticPurpose: `Teach: ${concept}`,
          characters: [],
          action: `Show ${concept} visually — ${contract.visualTeachingStrategy}`,
          mood: isFirst ? 'excited' : isLast ? 'satisfied' : 'curious',
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
    const { targetAge, vocabularyLevel } = resolveAgeGroup(input.answers, input.audienceMode);
    const sceneCount = Math.min(input.sceneCount, 7);

    return {
      version: 'education_contract_v1',
      topic,
      targetAge,
      learningObjective: educationalLearningObjective(topic, targetAge),
      keyConcepts: educationalKeyConcepts(topic),
      vocabularyLevel,
      explanationStrategy: explanationStrategyFor(vocabularyLevel),
      examplesToUse: educationalExamplesFor(topic),
      visualTeachingStrategy: visualTeachingStrategyFor(topic),
      narrationRequired: true,
      sceneProgression: educationalSceneProgression(sceneCount),
      recapIncluded: true,
      antiCommercialTopics: ['luxury goods', 'brand logos', 'advertisements', 'commercial products', 'aspirational lifestyle imagery'],
    };
  }
}
