import { describe, expect, it } from 'vitest';
import { destinationsFor, isDestinationActive, type NavAudience } from './navConfig';

/**
 * The navigation is the one place where "the product is twelve things" was literally true (2026-11-20). These tests pin the
 * two properties that make the reorganization hold, rather than the exact link list, so the menu can grow without the
 * structure quietly collapsing back into a flat bar:
 *
 *  1. A small number of destinations, no repeated href, and every href going somewhere real.
 *  2. R16 is offered only what its middleware allows — a child must never be linked to a route that blocks it.
 */

const CREATOR: NavAudience = { signedIn: true, username: 'ada', isR16: false, canAdmin: false };

/** Kept in sync with `R16_BLOCKED_ROUTES` in `middleware.ts`. A nav link to any of these bounces the child to the feed. */
const R16_BLOCKED = [
  '/generate',
  '/upload',
  '/credits',
  '/pricing',
  '/analytics',
  '/settings',
  '/subscription',
  '/admin',
];

function hrefsOf(audience: NavAudience): string[] {
  return destinationsFor(audience).flatMap((destination) => [
    destination.href,
    ...destination.links.map((link) => link.href.split('?')[0]),
  ]);
}

describe('the destinations describe the product', () => {
  it('gives a signed-in creator five destinations, not a flat list', () => {
    expect(destinationsFor(CREATOR).map((destination) => destination.key)).toEqual([
      'watch',
      'create',
      'learn',
      'films',
      'account',
    ]);
  });

  it('never lists the same destination or link twice', () => {
    // A destination's own href may legitimately repeat as its first link ("Create" and "Create → Projects" both go to
    // /projects); what must not repeat is a destination, or one link under two destinations — the two ways the old flat
    // bar ended up showing the same place twice.
    const destinations = destinationsFor(CREATOR);
    const topLevel = destinations.map((destination) => destination.href);
    expect(new Set(topLevel).size).toBe(topLevel.length);

    const seen = new Map<string, string>();
    for (const destination of destinations) {
      const links = destination.links.map((link) => link.href.split('?')[0]);
      expect(new Set(links).size).toBe(links.length);
      for (const link of links) {
        const owner = seen.get(link);
        expect(owner === undefined || owner === destination.key).toBe(true);
        seen.set(link, destination.key);
      }
    }
  });

  it('every label is non-empty and every href is an in-app path', () => {
    for (const destination of destinationsFor(CREATOR)) {
      expect(destination.label.trim().length).toBeGreaterThan(0);
      expect(destination.href.startsWith('/')).toBe(true);
      for (const link of destination.links) {
        expect(link.label.trim().length).toBeGreaterThan(0);
        expect(link.href.startsWith('/')).toBe(true);
      }
    }
  });

  it('offers no account menu to a guest', () => {
    const guest = destinationsFor({ signedIn: false, isR16: false, canAdmin: false });
    expect(guest.map((destination) => destination.key)).not.toContain('account');
    expect(hrefsOf({ signedIn: false, isR16: false, canAdmin: false })).not.toContain('/settings');
  });

  it('shows Admin only to a moderator or admin', () => {
    const admin = hrefsOf({ signedIn: true, username: 'ada', isR16: false, canAdmin: true });
    expect(admin).toContain('/admin');
    expect(hrefsOf(CREATOR)).not.toContain('/admin');
  });

  it('groups the old flat list instead of dropping it', () => {
    // Every destination the previous navbar exposed at the top level is still reachable — nothing 404s, and nothing was
    // silently retired during the reorganization.
    const hrefs = hrefsOf(CREATOR);
    for (const legacy of ['/create', '/story-playground', '/generate', '/avatar', '/director', '/story-studio', '/library', '/credits']) {
      expect(hrefs).toContain(legacy);
    }
  });
});

describe('R16 gets a kids product, not a smaller version of this one', () => {
  const r16 = destinationsFor({ signedIn: true, username: 'kid', isR16: true, canAdmin: false });

  it('offers only Watch and Stories', () => {
    expect(r16.map((destination) => destination.key)).toEqual(['watch', 'stories']);
  });

  it('never links a route the R16 middleware blocks', () => {
    const hrefs = hrefsOf({ signedIn: true, username: 'kid', isR16: true, canAdmin: false });
    for (const blocked of R16_BLOCKED) {
      expect(hrefs.some((href) => href === blocked || href.startsWith(`${blocked}/`))).toBe(false);
    }
  });

  it('still reaches story creation', () => {
    expect(JSON.stringify(r16)).toContain('/story-playground/new');
  });
});

describe('isDestinationActive', () => {
  const create = destinationsFor(CREATOR).find((destination) => destination.key === 'create')!;
  const watch = destinationsFor(CREATOR).find((destination) => destination.key === 'watch')!;

  it('matches the root only at the root', () => {
    expect(isDestinationActive(watch, '/')).toBe(true);
    expect(isDestinationActive(watch, '/projects')).toBe(false);
  });

  it('matches a destination and everything below it', () => {
    expect(isDestinationActive(create, '/projects')).toBe(true);
    expect(isDestinationActive(create, '/projects/abc')).toBe(true);
  });

  it('matches a child link and ignores its query string', () => {
    expect(isDestinationActive(create, '/story-playground/new')).toBe(true);
    expect(isDestinationActive(create, '/generate')).toBe(true);
  });

  it('does not match a sibling', () => {
    expect(isDestinationActive(create, '/academy')).toBe(false);
    expect(isDestinationActive(create, '/settings')).toBe(false);
  });
});
