import { describe, expect, it } from 'vitest';
import { routeChoices, routeIntent } from '../routeIntent';

describe('routeIntent - Homer reads what the creator is thinking', () => {
  it('reads an ad from ad words', () => {
    const route = routeIntent('a 15 second spot for my coffee brand');
    expect(route.path).toBe('AD');
    expect(route.provenance).toBe('HOMER_INFERENCE');
  });

  it('reads a commercial from campaign words', () => {
    expect(routeIntent('launch campaign with a testimonial').path).toBe('COMMERCIAL');
  });

  it('reads a film from scene words', () => {
    expect(routeIntent('a short film about a kid who loses a shoe').path).toBe('FILM');
  });

  it('reads writing from story words', () => {
    expect(routeIntent('write a chapter about a dog going to school').path).toBe('WRITING');
  });

  it('carries the premise verbatim, because the flow must not ask again', () => {
    expect(routeIntent('  a   film about   rain ').premise).toBe('a film about rain');
  });

  it('offers a real question when nothing matches, not a guess', () => {
    const route = routeIntent('something about my mother');
    expect(route.path).toBe('FILM');
    expect(route.question).toMatch(/film or as a written story/);
    expect(routeChoices(route).length).toBeLessThanOrEqual(2);
  });

  it('never offers more than four buttons, and marks exactly one as chosen', () => {
    const route = routeIntent('a commercial film ad with a story script');
    const choices = routeChoices(route);
    expect(choices.length).toBeLessThanOrEqual(4);
    expect(choices.filter((choice) => choice.chosen)).toHaveLength(1);
    expect(choices[0]!.path).toBe(route.path);
  });

  it('prefers the cheaper path on a tie: an ad before a commercial', () => {
    // "ad" and "commercial" both vote once.
    expect(routeIntent('an ad commercial').path).toBe('AD');
  });
});
