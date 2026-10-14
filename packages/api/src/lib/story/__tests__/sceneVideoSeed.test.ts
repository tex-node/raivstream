import { describe, it, expect } from 'vitest';
import { chooseVideoSeedSource } from '../videoSeedPolicy';

const older = new Date('2026-10-14T03:00:00Z');
const newer = new Date('2026-10-14T06:00:00Z');

describe('chooseVideoSeedSource', () => {
  it('1. scene 1 → own still', () => {
    expect(
      chooseVideoSeedSource({ orderIndex: 1, sceneImageCreatedAt: newer, prevVideoCreatedAt: older, hasPrevVideo: true }),
    ).toBe('own-still');
  });

  it('2. scene > 1 with no previous READY video → own still', () => {
    expect(
      chooseVideoSeedSource({ orderIndex: 4, sceneImageCreatedAt: newer, prevVideoCreatedAt: null, hasPrevVideo: false }),
    ).toBe('own-still');
  });

  it('3. scene > 1, previous video exists, still older than prev video → chain preserved', () => {
    expect(
      chooseVideoSeedSource({ orderIndex: 4, sceneImageCreatedAt: older, prevVideoCreatedAt: newer, hasPrevVideo: true }),
    ).toBe('prev-last-frame');
  });

  it('4. scene > 1, previous video exists, still newer than prev video → own still (regeneration wins)', () => {
    expect(
      chooseVideoSeedSource({ orderIndex: 6, sceneImageCreatedAt: newer, prevVideoCreatedAt: older, hasPrevVideo: true }),
    ).toBe('own-still');
  });

  it('5. no scene image at all, previous video exists → chain (fallback)', () => {
    expect(
      chooseVideoSeedSource({ orderIndex: 6, sceneImageCreatedAt: null, prevVideoCreatedAt: older, hasPrevVideo: true }),
    ).toBe('prev-last-frame');
  });
});
