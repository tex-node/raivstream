/**
 * Raivstream 5.0 — Series domain types (Slice 6).
 *
 * Canon = what must remain true.
 * Memory = what Raivstream has learned.
 * Episode state = what is currently happening.
 * These are deliberately distinct structures — never one JSON blob.
 */

export type SeriesStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type EpisodeStatus = 'DRAFT' | 'PLANNING' | 'IN_PRODUCTION' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface SeriesCanon {
  version: number;
  world: Record<string, unknown>;
  storyRules: string[];
  worldRules: string[];
  characterRules: string[];
  visualLanguage: Record<string, unknown>;
  audioLanguage: Record<string, unknown>;
  characterCanon: Array<{
    name: string;
    identity: Record<string, unknown>;
    relationships: Record<string, unknown>;
    voice?: string;
  }>;
  notes: string[];
}

export interface SeriesMemory {
  learned: Array<{ fact: string; episodeNumber?: number }>;
  openThreads: Array<{ thread: string; openedInEpisode?: number }>;
  preferences: string[];
}

export interface EpisodeState {
  location?: string;
  wardrobe?: Record<string, unknown>;
  emotionalState?: string;
  relationshipState?: Record<string, unknown>;
  storyObjective?: string;
}

export interface SeriesState {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: SeriesStatus;
  canon: SeriesCanon | null;
  memory: SeriesMemory | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeView {
  id: string;
  seriesId: string;
  projectId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string | null;
  status: EpisodeStatus;
  state: EpisodeState | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeriesContext {
  seriesId: string;
  seriesTitle: string;
  canon: SeriesCanon | null;
  visualLanguage: Record<string, unknown> | null;
  audioLanguage: Record<string, unknown> | null;
  /** Relevant character memory (identity from canon, state from the episode). */
  characters: Array<{ name: string; identity: Record<string, unknown>; episodeState?: EpisodeState }>;
  /** Relevant world memory (locations + rules). */
  worlds: Array<{ name: string; description: string }>;
  previousEpisode: { episodeNumber: number; title: string; synopsis: string | null; state: EpisodeState | null } | null;
  currentEpisode: { episodeNumber: number; title: string; synopsis: string | null; state: EpisodeState | null } | null;
  unresolvedThreads: string[];
}