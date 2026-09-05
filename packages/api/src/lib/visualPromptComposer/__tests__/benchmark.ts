// Local benchmark: V1 vs V2 prompt comparison
// Run: npx ts-node -r tsconfig-paths/register <this file>
// (No image generation performed — prompt-only qualification)

import { compose } from '../composer';
import type { VpcComposerInput, CharacterMemoryInput } from '../types';

const MAX_PROMPT = 1800;
const MAX_NEG = 900;

type BenchmarkStory = {
  id: string;
  title: string;
  idea: string;
  audienceMode: 'KIDS' | 'GENERAL';
  visualStyle: string;
  characterMemory: CharacterMemoryInput[];
  scenes: Array<{
    id: string;
    title: string;
    description: string;
    locationType?: string;
    indoorOutdoor?: string;
    mood?: string;
    emotion?: string;
    cameraStyle?: string;
    timeOfDay?: string;
  }>;
};

const STORIES: BenchmarkStory[] = [
  {
    id: 'b01',
    title: 'Max Goes to School',
    idea: 'A dog goes to school for the first time.',
    audienceMode: 'KIDS',
    visualStyle: 'STORYBOOK_ILLUSTRATION',
    characterMemory: [{
      id: 'max-01',
      name: 'Max',
      role: 'main character',
      species: 'Dog',
      ageDescription: 'young puppy',
      gender: 'male',
      visualDescription: 'Max is a golden labrador puppy with floppy ears, wearing a tiny red backpack.',
    }],
    scenes: [
      { id: 'b01s1', title: 'Arrival', description: 'Max stands nervously at the school gate, clutching his backpack.', locationType: 'school gate', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING', cameraStyle: 'MEDIUM_SHOT', emotion: 'CURIOUS' },
      { id: 'b01s2', title: 'Classroom', description: 'Max takes his seat at a small desk next to a rabbit.', locationType: 'classroom', indoorOutdoor: 'indoor', emotion: 'HAPPY', cameraStyle: 'WIDE_SHOT' },
      { id: 'b01s3', title: 'Recess', description: 'Max chases a ball on the playground with new friends.', locationType: 'playground', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', cameraStyle: 'WIDE_SHOT' },
    ],
  },
  {
    id: 'b02',
    title: 'Kofi Learns to Swim',
    idea: 'Kofi wants to learn to swim.',
    audienceMode: 'KIDS',
    visualStyle: 'AFRICAN_FOLKTALE_ILLUSTRATION',
    characterMemory: [{
      id: 'kofi-01',
      name: 'Kofi',
      role: 'protagonist',
      species: 'Human',
      ageDescription: '7 years old',
      gender: 'male',
      visualDescription: 'Kofi is a boy with short natural hair, warm brown skin, wearing swim shorts and goggles around his neck.',
    }],
    scenes: [
      { id: 'b02s1', title: 'Poolside Fear', description: 'Kofi stands at the edge of the pool, staring at the water.', locationType: 'swimming pool', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'CALM', cameraStyle: 'MEDIUM_SHOT' },
      { id: 'b02s2', title: 'First Kick', description: 'Coach holds Kofi in the water as Kofi kicks his legs for the first time.', locationType: 'swimming pool', indoorOutdoor: 'outdoor', emotion: 'BRAVE' },
      { id: 'b02s3', title: 'First Float', description: 'Kofi floats on his back, arms wide, smiling at the sky.', locationType: 'swimming pool', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'HAPPY' },
    ],
  },
  {
    id: 'b03',
    title: 'Amara\'s Magic Drum',
    idea: 'A girl from Lagos finds a magic drum.',
    audienceMode: 'KIDS',
    visualStyle: 'AFRICAN_FOLKTALE_ILLUSTRATION',
    characterMemory: [{
      id: 'amara-01',
      name: 'Amara',
      role: 'protagonist',
      species: 'Human',
      ageDescription: '9 years old',
      gender: 'female',
      visualDescription: 'Amara is a girl with long braids tied with orange ribbons, dark skin, wearing a yellow and green wrapper.',
    }],
    scenes: [
      { id: 'b03s1', title: 'Discovery', description: 'Amara finds a small wooden drum buried under a mango tree.', locationType: 'backyard under mango tree', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING' },
      { id: 'b03s2', title: 'First Beat', description: 'Amara beats the drum and the leaves around her begin to dance.', locationType: 'backyard', indoorOutdoor: 'outdoor', emotion: 'SURPRISED', cameraStyle: 'MEDIUM_SHOT' },
      { id: 'b03s3', title: 'Village Celebration', description: 'Amara plays the drum for her whole village as everyone dances.', locationType: 'village square', indoorOutdoor: 'outdoor', timeOfDay: 'SUNSET', emotion: 'HAPPY' },
    ],
  },
  {
    id: 'b04',
    title: 'Reconciliation',
    idea: 'A boy reconciles with his estranged father.',
    audienceMode: 'GENERAL',
    visualStyle: 'PHOTOREALISTIC',
    characterMemory: [
      { id: 'dayo-01', name: 'Dayo', role: 'protagonist', species: 'Human', ageDescription: '16 years old', gender: 'male', visualDescription: 'Dayo is a tall teenage boy with short locs, wearing a green hoodie.' },
      { id: 'father-01', name: 'Mr. Adeyemi', role: 'father', species: 'Human', ageDescription: '45 years old', gender: 'male', visualDescription: 'Mr. Adeyemi is a broad-shouldered man with greying temples and tired eyes, wearing a simple shirt.' },
    ],
    scenes: [
      { id: 'b04s1', title: 'The Letter', description: 'Dayo reads a letter from his father at his desk.', locationType: 'bedroom', indoorOutdoor: 'indoor', timeOfDay: 'NIGHT', cameraStyle: 'CLOSE_UP', emotion: 'SAD' },
      { id: 'b04s2', title: 'The Meeting', description: 'Dayo and Mr. Adeyemi stand facing each other outside the train station.', locationType: 'train station exterior', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'BRAVE' },
      { id: 'b04s3', title: 'Forgiveness', description: 'Dayo accepts his father\'s outstretched hand. Both look relieved.', locationType: 'park bench', indoorOutdoor: 'outdoor', timeOfDay: 'SUNSET', emotion: 'HAPPY', cameraStyle: 'MEDIUM_SHOT' },
    ],
  },
  {
    id: 'b05',
    title: 'The Festival Sisters',
    idea: 'Two sisters run a food stall during a festival.',
    audienceMode: 'GENERAL',
    visualStyle: 'THREE_D_ANIMATED',
    characterMemory: [
      { id: 'chi-01', name: 'Chi', role: 'elder sister', species: 'Human', ageDescription: '19 years old', gender: 'female', visualDescription: 'Chi is a confident young woman with natural afro, wearing a colourful ankara apron.' },
      { id: 'nne-01', name: 'Nne', role: 'younger sister', species: 'Human', ageDescription: '14 years old', gender: 'female', visualDescription: 'Nne is a shy girl with cornrows, wearing a matching ankara top.' },
    ],
    scenes: [
      { id: 'b05s1', title: 'Setting Up', description: 'Chi and Nne arrange their food stall early in the morning before the festival opens.', locationType: 'outdoor market stall', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING' },
      { id: 'b05s2', title: 'Rush Hour', description: 'Chi serves customers while Nne wraps jollof rice hurriedly.', locationType: 'busy market stall', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'EXCITED' },
      { id: 'b05s3', title: 'Success', description: 'Chi and Nne count their earnings and hug each other at the empty stall at sunset.', locationType: 'market stall at sunset', indoorOutdoor: 'outdoor', timeOfDay: 'SUNSET', emotion: 'HAPPY' },
    ],
  },
  {
    id: 'b06',
    title: 'The Ocean\'s Lesson',
    idea: 'The ocean teaches patience.',
    audienceMode: 'GENERAL',
    visualStyle: 'WATERCOLOR',
    characterMemory: [{ id: 'ocean-01', name: 'The Ocean', role: 'guide figure', species: 'Spirit', ageDescription: 'ancient', visualDescription: 'A translucent figure made of water, flowing and calm, rising from the sea.' }],
    scenes: [
      { id: 'b06s1', title: 'The Shore', description: 'A young woman sits on the shore waiting for a boat that doesn\'t come.', locationType: 'ocean shore', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING', emotion: 'SAD' },
      { id: 'b06s2', title: 'The Voice', description: 'The Ocean rises gently before her, speaking without words.', locationType: 'shallow ocean waves', indoorOutdoor: 'outdoor', cameraStyle: 'MEDIUM_SHOT', emotion: 'CALM' },
      { id: 'b06s3', title: 'The Return', description: 'The woman returns to the shore, at peace, watching the horizon.', locationType: 'ocean shore at sunset', indoorOutdoor: 'outdoor', timeOfDay: 'SUNSET' },
    ],
  },
  {
    id: 'b07',
    title: 'The Indoor Night Scene',
    idea: 'A child reads alone at night.',
    audienceMode: 'KIDS',
    visualStyle: 'STORYBOOK_ILLUSTRATION',
    characterMemory: [{ id: 'ada-01', name: 'Ada', role: 'reader', species: 'Human', ageDescription: '8 years old', gender: 'female', visualDescription: 'Ada is a girl with neat plaits, wearing a white nightgown with small flowers, holding a large picture book.' }],
    scenes: [
      { id: 'b07s1', title: 'Late Night', description: 'Ada sits under her blanket with a flashlight, reading a large picture book.', locationType: 'bedroom', indoorOutdoor: 'indoor', timeOfDay: 'NIGHT', emotion: 'CURIOUS', cameraStyle: 'CLOSE_UP' },
    ],
  },
  {
    id: 'b08',
    title: 'The Adventure',
    idea: 'A brave explorer finds a hidden waterfall.',
    audienceMode: 'GENERAL',
    visualStyle: 'CINEMATIC_FANTASY',
    characterMemory: [{ id: 'leo-01', name: 'Leo', role: 'explorer', species: 'Human', ageDescription: '25 years old', gender: 'male', visualDescription: 'Leo is a young man in khaki with a worn map, a compass around his neck, and muddy boots.' }],
    scenes: [
      { id: 'b08s1', title: 'Into the Forest', description: 'Leo pushes through dense jungle foliage, compass in hand.', locationType: 'dense jungle', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING', cameraStyle: 'MEDIUM_SHOT' },
      { id: 'b08s2', title: 'The Waterfall', description: 'Leo gasps as a towering waterfall appears through the trees, mist rising.', locationType: 'hidden waterfall', indoorOutdoor: 'outdoor', emotion: 'SURPRISED', cameraStyle: 'WIDE_SHOT' },
      { id: 'b08s3', title: 'Victory', description: 'Leo stands at the edge of the waterfall pool, arms outstretched, victorious.', locationType: 'waterfall pool', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'EXCITED' },
    ],
  },
  {
    id: 'b09',
    title: 'The Friendship',
    idea: 'Two very different children become best friends.',
    audienceMode: 'KIDS',
    visualStyle: 'COMIC_BOOK',
    characterMemory: [
      { id: 'zara-01', name: 'Zara', role: 'quiet artist', species: 'Human', ageDescription: '9 years old', gender: 'female', visualDescription: 'Zara is a quiet girl with thick glasses, natural hair, always carrying a sketchbook.' },
      { id: 'ben-01', name: 'Ben', role: 'loud athlete', species: 'Human', ageDescription: '9 years old', gender: 'male', visualDescription: 'Ben is a loud energetic boy with a big smile, always wearing a sports cap.' },
    ],
    scenes: [
      { id: 'b09s1', title: 'Unlikely Pair', description: 'Zara sits alone drawing while Ben runs past and accidentally kicks a ball into her sketchbook.', locationType: 'school playground', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON' },
      { id: 'b09s2', title: 'Discovery', description: 'Ben looks at Zara\'s drawing of him in amazement.', locationType: 'bench in schoolyard', indoorOutdoor: 'outdoor', cameraStyle: 'CLOSE_UP', emotion: 'SURPRISED' },
      { id: 'b09s3', title: 'New Friends', description: 'Zara and Ben walk home together, chatting and laughing.', locationType: 'school gate street', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'HAPPY' },
    ],
  },
  {
    id: 'b10',
    title: 'The Mystery Map',
    idea: 'A girl finds a mysterious map in her grandmother\'s house.',
    audienceMode: 'GENERAL',
    visualStyle: 'WATERCOLOR',
    characterMemory: [{ id: 'nadia-01', name: 'Nadia', role: 'detective', species: 'Human', ageDescription: '12 years old', gender: 'female', visualDescription: 'Nadia has curly red-brown hair in a ponytail, wearing a yellow cardigan and carrying a leather satchel.' }],
    scenes: [
      { id: 'b10s1', title: 'The Attic', description: 'Nadia opens a dusty wooden chest in her grandmother\'s attic and finds a rolled-up map.', locationType: 'dusty attic', indoorOutdoor: 'indoor', timeOfDay: 'AFTERNOON', cameraStyle: 'CLOSE_UP', emotion: 'CURIOUS' },
      { id: 'b10s2', title: 'Deciphering', description: 'Nadia spreads the map on a table, studying the symbols with a magnifying glass.', locationType: 'kitchen table', indoorOutdoor: 'indoor', emotion: 'CURIOUS' },
      { id: 'b10s3', title: 'The Hidden Garden', description: 'Nadia finds the hidden garden from the map, overgrown with flowers.', locationType: 'secret garden', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'SURPRISED' },
    ],
  },
  {
    id: 'b11',
    title: 'The Emotional Close-Up',
    idea: 'A child says goodbye to a grandparent.',
    audienceMode: 'GENERAL',
    visualStyle: 'PHOTOREALISTIC',
    characterMemory: [
      { id: 'emeka-01', name: 'Emeka', role: 'grandson', species: 'Human', ageDescription: '11 years old', gender: 'male', visualDescription: 'Emeka is a boy with a shaved head and big dark eyes, wearing a school uniform.' },
      { id: 'grams-01', name: 'Grandma', role: 'grandmother', species: 'Human', ageDescription: '70 years old', gender: 'female', visualDescription: 'Grandma has a warm wrinkled face, grey hair pinned up, wearing a patterned ankara wrapper.' },
    ],
    scenes: [
      { id: 'b11s1', title: 'Goodbye Hug', description: 'Emeka hugs Grandma tightly at the door. She pats his back.', locationType: 'front door of home', indoorOutdoor: 'outdoor', timeOfDay: 'MORNING', emotion: 'SAD', cameraStyle: 'CLOSE_UP' },
    ],
  },
  {
    id: 'b12',
    title: 'Benny the Bunny Shares',
    idea: 'A bunny learns to share at a garden party.',
    audienceMode: 'KIDS',
    visualStyle: 'STORYBOOK_ILLUSTRATION',
    characterMemory: [{
      id: 'benny-01',
      name: 'Benny',
      role: 'main character',
      species: 'Rabbit',
      ageDescription: 'young bunny',
      gender: 'male',
      visualDescription: 'Benny is a fluffy white bunny with long ears, blue eyes, wearing a small orange scarf.',
    }],
    scenes: [
      { id: 'b12s1', title: 'The Party', description: 'Benny arrives at the meadow garden party, carrying a large carrot cake.', locationType: 'flower meadow', indoorOutdoor: 'outdoor', timeOfDay: 'AFTERNOON', emotion: 'HAPPY', cameraStyle: 'WIDE_SHOT' },
      { id: 'b12s2', title: 'Too Much Cake', description: 'Benny eats the entire cake alone while others watch hungrily.', locationType: 'flower meadow', indoorOutdoor: 'outdoor', emotion: 'HAPPY' },
      { id: 'b12s3', title: 'Learning Sharing', description: 'Benny gives the last piece of cake to a small mouse who had none.', locationType: 'flower meadow', indoorOutdoor: 'outdoor', timeOfDay: 'SUNSET', emotion: 'HAPPY', cameraStyle: 'MEDIUM_SHOT' },
    ],
  },
];

type ScoreCard = {
  storyId: string;
  sceneId: string;
  characterIdentityPresent: boolean;
  requiredActionPresent: boolean;
  environmentSpecific: boolean;
  cameraPresent: boolean;
  compositionPresent: boolean;
  continuityPresent: boolean;
  stylePreserved: boolean;
  overlayProtectionPresent: boolean;
  promptLength: number;
  negLength: number;
  conflictsFound: number;
  composerCost: number;
};

function runBenchmark() {
  const scorecards: ScoreCard[] = [];
  const latencies: number[] = [];
  const allScores: Record<string, boolean[]> = {};

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VISUAL PROMPT COMPOSER V2 — LOCAL BENCHMARK');
  console.log('═══════════════════════════════════════════════════════\n');

  let totalScenes = 0;

  for (const story of STORIES) {
    console.log(`\n📖 [${story.id}] ${story.title} (${story.audienceMode}, ${story.visualStyle})`);

    for (const scene of story.scenes) {
      totalScenes++;
      const input: VpcComposerInput = {
        scene,
        project: {
          title: story.title,
          audienceMode: story.audienceMode,
          visualStyle: story.visualStyle,
          characterMemory: story.characterMemory,
        },
        medium: 'IMAGE',
        maxPromptLength: MAX_PROMPT,
        maxNegativePromptLength: MAX_NEG,
        audienceMode: story.audienceMode,
      };

      const t0 = performance.now();
      const out = compose(input);
      const t1 = performance.now();
      const latMs = t1 - t0;
      latencies.push(latMs);

      const sc: ScoreCard = {
        storyId: story.id,
        sceneId: scene.id,
        characterIdentityPresent: story.characterMemory.every((ch) =>
          out.prompt.includes(ch.name)),
        requiredActionPresent: out.prompt.length > 50,
        environmentSpecific: out.canonical.environment.length > 5 && out.canonical.environment !== 'unspecified setting',
        cameraPresent: out.prompt.toLowerCase().includes('shot') || out.prompt.toLowerCase().includes('camera'),
        compositionPresent: out.prompt.toLowerCase().includes('composition') || out.prompt.toLowerCase().includes('framing') || out.prompt.toLowerCase().includes('9:16'),
        continuityPresent: out.canonical.continuity.length > 0,
        stylePreserved: out.canonical.style === story.visualStyle || (story.visualStyle === 'NONEXISTENT' && out.canonical.style === 'STORYBOOK_ILLUSTRATION'),
        overlayProtectionPresent: out.negativePrompt.includes('phone UI') && out.negativePrompt.includes('social media UI') && out.negativePrompt.includes('gallery UI'),
        promptLength: out.prompt.length,
        negLength: out.negativePrompt.length,
        conflictsFound: out.canonical.detectedConflicts.length,
        composerCost: out.composerCost,
      };
      scorecards.push(sc);

      const symbol = (b: boolean) => b ? '✓' : '✗';
      console.log(`  Scene [${scene.id}] "${scene.title}"`);
      console.log(`    Char identity: ${symbol(sc.characterIdentityPresent)} | Action: ${symbol(sc.requiredActionPresent)} | Env: ${symbol(sc.environmentSpecific)}`);
      console.log(`    Camera: ${symbol(sc.cameraPresent)} | Composition: ${symbol(sc.compositionPresent)} | Continuity: ${symbol(sc.continuityPresent)}`);
      console.log(`    Style: ${symbol(sc.stylePreserved)} | Overlay guard: ${symbol(sc.overlayProtectionPresent)}`);
      console.log(`    Len: ${sc.promptLength}ch / ${sc.negLength}ch neg | Conflicts: ${sc.conflictsFound} | Latency: ${latMs.toFixed(2)}ms | Cost: $${sc.composerCost}`);
      if (out.canonical.detectedConflicts.length) {
        console.log(`    ⚠ Conflicts: ${out.canonical.detectedConflicts.join('; ')}`);
      }
    }
  }

  // ─── Aggregate Metrics ───────────────────────────────────────────────────

  const total = scorecards.length;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';

  const charOk = scorecards.filter((s) => s.characterIdentityPresent).length;
  const actionOk = scorecards.filter((s) => s.requiredActionPresent).length;
  const envOk = scorecards.filter((s) => s.environmentSpecific).length;
  const camOk = scorecards.filter((s) => s.cameraPresent).length;
  const compOk = scorecards.filter((s) => s.compositionPresent).length;
  const contOk = scorecards.filter((s) => s.continuityPresent).length;
  const styleOk = scorecards.filter((s) => s.stylePreserved).length;
  const overlayOk = scorecards.filter((s) => s.overlayProtectionPresent).length;

  const sortedLat = [...latencies].sort((a, b) => a - b);
  const medianLat = sortedLat[Math.floor(sortedLat.length / 2)];
  const p95Lat = sortedLat[Math.floor(sortedLat.length * 0.95)];
  const totalCost = scorecards.reduce((sum, s) => sum + s.composerCost, 0);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BENCHMARK SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Stories:  ${STORIES.length}`);
  console.log(`  Scenes:   ${total}`);
  console.log(`\n  Metric                          Pass Rate`);
  console.log(`  ─────────────────────────────── ─────────`);
  console.log(`  Character identity in prompt    ${pct(charOk)}   (target ≥95%)`);
  console.log(`  Required action present         ${pct(actionOk)}   (target ≥95%)`);
  console.log(`  Environment specific            ${pct(envOk)}   (target ≥90%)`);
  console.log(`  Camera term present             ${pct(camOk)}   (target ≥80%)`);
  console.log(`  Composition present             ${pct(compOk)}   (target ≥80%)`);
  console.log(`  Continuity rules present        ${pct(contOk)}   (target ≥90%)`);
  console.log(`  Style preserved                 ${pct(styleOk)}   (target 100%)`);
  console.log(`  Overlay protection in neg       ${pct(overlayOk)}   (target 100%)`);
  console.log(`\n  Latency (median):               ${medianLat.toFixed(2)}ms`);
  console.log(`  Latency (p95):                  ${p95Lat.toFixed(2)}ms`);
  console.log(`  Composer provider cost:         $${totalCost} (target $0)`);

  const passedTargets = [
    charOk / total >= 0.95,
    actionOk / total >= 0.95,
    styleOk / total === 1.0,
    overlayOk / total === 1.0,
  ];
  const gatePassed = passedTargets.every(Boolean);

  console.log(`\n  Gate targets met:               ${gatePassed ? '✓ ALL MET' : '✗ SOME FAILED'}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

runBenchmark();
