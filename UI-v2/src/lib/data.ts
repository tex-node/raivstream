// Mock data. Replace each export with a Supabase query / API call when wiring the backend.

export const user = {
  name: 'Ada Mensah',
  initials: 'AM',
  handle: '@adamakesfilms',
  role: 'Creator',
  credits: 2480,
  followers: '12.4K',
  films: 18,
  views: '312K',
}

export type Project = {
  id: string
  title: string
  kind: string
  still: string
  progress: number
  badge: string
}

export const projects: Project[] = [
  { id: 'dog', title: 'A Dog Going to School', kind: 'Short film', still: 'still-dawn', progress: 58, badge: 'Scene 3 of 6' },
  { id: 'lumen', title: 'Lumen Coffee', kind: 'Advert · 30s', still: 'still-night', progress: 84, badge: 'Advert · 30s' },
  { id: 'rooftop', title: 'Rooftop at Dusk', kind: 'Short film · draft', still: 'still-grey', progress: 18, badge: 'Draft' },
]

export const story = {
  chapter: 'Chapter 1 · The gate',
  title: 'The bags by the door',
  strength: 74,
  paragraphs: [
    'The bags were by the door before the sun was properly up. Max knew that sound. It was the sound of everyone leaving without him.',
    'So he went too. He walked behind the children, past the bakery and the bus stop, until the pavement turned into a gate and the gate turned out to be very tall.',
    'That was where Luna found him — sitting, not going in. She did not tell him to be brave. She just walked beside him, and that turned out to be the same thing.',
    'The classroom smelled of chalk and oranges. Nobody had planned for a dog, so Ms. Bello made a plan on the spot.',
  ],
  actions: ['Develop', 'More tension', 'Funnier', 'Another ending'],
}

export type Character = {
  name: string
  role: string
  initial: string
  portrait: string
  scenes: string
  traits: { k: string; v: string }[]
}

export const cast: Character[] = [
  { name: 'Max', role: 'Lead · small terrier', initial: 'M', portrait: 'portrait-tan', scenes: 'all 6 scenes', traits: [
    { k: 'Look', v: 'Scruffy tan coat, one ear always up, red collar.' },
    { k: 'Personality', v: 'Curious, loyal, braver than he looks.' },
    { k: 'Wants', v: 'To go wherever the children go.' },
    { k: 'Fears', v: 'Being left behind at the gate.' } ] },
  { name: 'Luna', role: 'Friend · schoolgirl', initial: 'L', portrait: 'portrait-violet', scenes: 'scenes 3–6', traits: [
    { k: 'Look', v: 'Purple backpack, braids, scuffed trainers.' },
    { k: 'Personality', v: 'Quiet, kind, notices everything.' },
    { k: 'Wants', v: 'Someone to walk in with.' },
    { k: 'Fears', v: 'Being the new kid again.' } ] },
  { name: 'Tobi', role: 'Neighbour · boy', initial: 'T', portrait: 'portrait-cyan', scenes: 'scenes 1–2', traits: [
    { k: 'Look', v: 'Oversized blue uniform, cap backwards.' },
    { k: 'Personality', v: 'Always running, always late.' },
    { k: 'Wants', v: 'To be on time, for once.' },
    { k: 'Fears', v: 'The headteacher.' } ] },
  { name: 'Ms. Bello', role: 'Teacher', initial: 'B', portrait: 'portrait-pink', scenes: 'scenes 5–6', traits: [
    { k: 'Look', v: 'Pink gele, warm smile, a whistle.' },
    { k: 'Personality', v: 'Firm, funny, improvises well.' },
    { k: 'Wants', v: 'A calm first morning.' },
    { k: 'Fears', v: 'Chaos in the yard.' } ] },
]

export const scenes = [
  { n: '01', title: 'Morning', still: 'still-dawn' },
  { n: '02', title: 'Bakery', still: 'still-violet' },
  { n: '03', title: 'School gate', still: 'still-gate' },
  { n: '04', title: 'Classroom', still: 'still-warm' },
  { n: '05', title: 'The yard', still: 'still-green' },
  { n: '06', title: 'Home time', still: 'still-empty' },
]

// Scene Director controls: each row cycles through its options on tap.
export const directions: Record<string, string[]> = {
  Mood: ['Hopeful', 'Nervous', 'Bold'],
  Camera: ['Close, push in', 'Wide, static', 'Low, tracking'],
  Light: ['Golden hour', 'Soft morning', 'Dramatic'],
  Weather: ['Clear', 'Overcast', 'Light rain'],
  Pace: ['Gentle', 'Still', 'Energetic'],
}

// Intended user-facing copy for generation status events.
export const generationSteps: [number, string, number][] = [
  [0, 'Preparing your scene…', 12],
  [900, 'Creating the picture…', 46],
  [2100, 'Checking continuity…', 78],
  [3100, 'Almost ready…', 94],
]

export type LibraryItem = { type: 'Films' | 'Scenes' | 'Characters'; still: string; title: string; meta: string; duration?: string }

export const library: LibraryItem[] = [
  { type: 'Films', still: 'still-dawn', title: 'A Dog Going to School', meta: 'Short film · today', duration: '2:14' },
  { type: 'Films', still: 'still-night', title: 'Lumen Coffee', meta: 'Advert · yesterday', duration: '0:30' },
  { type: 'Scenes', still: 'still-gate', title: 'Scene 03 · School gate', meta: 'Kept · just now' },
  { type: 'Scenes', still: 'still-violet', title: 'Scene 02 · Bakery', meta: 'Kept · 2h ago' },
  { type: 'Characters', still: 'portrait-tan', title: 'Max', meta: 'Character · 6 scenes' },
  { type: 'Scenes', still: 'still-warm', title: 'Scene 04 · Classroom', meta: 'Draft · 3h ago' },
  { type: 'Characters', still: 'portrait-violet', title: 'Luna', meta: 'Character · 4 scenes' },
  { type: 'Scenes', still: 'still-green', title: 'Scene 05 · The yard', meta: 'Kept · yesterday' },
  { type: 'Characters', still: 'portrait-cyan', title: 'Tobi', meta: 'Character · 2 scenes' },
  { type: 'Scenes', still: 'still-grey', title: 'Rooftop, dusk', meta: 'Draft · last week' },
]

export const feed = [
  { still: 'still-gate', creator: 'Ada Mensah', initial: 'A', caption: 'He only wanted to go to school. Episode 1 of “A Dog Going to School”.', meta: 'Short film · 2:14', likes: 12400, comments: '842' },
  { still: 'still-night', creator: 'Lumen Coffee', initial: 'L', caption: 'Lagos wakes up at 5am. So do we.', meta: 'Advert · 0:30', likes: 3100, comments: '96' },
  { still: 'still-green', creator: 'Kofi Studio', initial: 'K', caption: 'The market at the edge of the forest — part 3.', meta: 'Series · 1:48', likes: 28900, comments: '1.2K' },
]

export const kids = [
  { cat: 'Stories', still: 'kids-sky', title: 'The Sky Whale', age: '4+' },
  { cat: 'Learn', still: 'kids-leaf', title: 'Counting with Ants', age: '4+' },
  { cat: 'Songs', still: 'kids-candy', title: 'Jollof Song', age: '3+' },
  { cat: 'Stories', still: 'kids-lemon', title: 'Luna’s Lantern', age: '6+' },
  { cat: 'Learn', still: 'kids-sky', title: 'Why Is the Sea Salty?', age: '7+' },
  { cat: 'Songs', still: 'kids-sun', title: 'Drum Circle', age: '3+' },
  { cat: 'Stories', still: 'kids-leaf', title: 'The Tortoise and the Rain', age: '5+' },
  { cat: 'Learn', still: 'kids-candy', title: 'Planets for Beginners', age: '6+' },
]

export const insights: Record<string, { v: number[]; total: string; delta: string; start: string }> = {
  '7D': { v: [4.1, 5.2, 4.8, 6.9, 7.4, 9.8, 10.0], total: '48.2K', delta: '18%', start: '7 days ago' },
  '28D': { v: [2.1, 2.6, 2.4, 3.0, 2.8, 3.3, 3.1, 3.6, 3.4, 3.9, 4.2, 3.8, 4.4, 4.0, 4.6, 4.9, 4.5, 5.1, 5.4, 5.0, 5.8, 6.1, 6.9, 7.4, 9.8, 9.2, 9.6, 10.0], total: '146K', delta: '42%', start: '28 days ago' },
  '90D': { v: [1.2, 1.4, 1.3, 1.8, 2.0, 2.2, 2.1, 2.7, 3.0, 3.2, 3.6, 4.1, 5.0], total: '312K', delta: '96%', start: '90 days ago' },
}

export const topFilms = [
  { still: 'still-dawn', title: 'A Dog Going to School', kind: 'Short film', views: '31.4K' },
  { still: 'still-night', title: 'Lumen Coffee', kind: 'Advert', views: '12.9K' },
  { still: 'still-grey', title: 'Rooftop at Dusk · teaser', kind: 'Short film', views: '3.9K' },
]

export const packs = [
  { tag: 'Starter', amount: '1,000', note: 'About 20 scenes', price: '[PRICE]' },
  { tag: 'Most popular', amount: '5,000', note: 'About 100 scenes', price: '[PRICE]' },
  { tag: 'Best value', amount: '12,000', note: 'About 240 scenes', price: '[PRICE]' },
]

export const ledger = [
  { label: 'Scene 03 · School gate', when: 'Today', amount: -50 },
  { label: 'Scene 02 · Bakery', when: 'Today', amount: -50 },
  { label: 'Top up', when: 'Oct 2', amount: 2000 },
]

export const reviewQueue = [
  { id: 0, still: 'still-night', title: 'Night market chase', creator: '@kofistudio', where: 'Watch', reports: 4, reason: 'Possible copyrighted music', posted: '2h ago' },
  { id: 1, still: 'kids-sun', title: 'Max at the beach', creator: '@adamakesfilms', where: 'R16 Kids', reports: 2, reason: 'Check age rating', posted: '5h ago' },
  { id: 2, still: 'portrait-cyan', title: 'Face swap test', creator: '@newuser_204', where: 'Watch', reports: 7, reason: 'Real person’s likeness', posted: 'Yesterday' },
  { id: 3, still: 'still-green', title: 'Forest drumming', creator: '@ama.k', where: 'Watch', reports: 1, reason: 'Spam link in caption', posted: 'Yesterday' },
]
