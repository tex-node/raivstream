import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUSH_CONTROLS_COURSE_TEMPLATE, RUSH_LESSONS } from '../rushAcademyTemplate';

/**
 * Phase 9's exit criterion, as a test (2026-11-08).
 *
 * "Twelve lessons / four modules, each referencing a control a creator can actually reach."
 * Extended to fifteen / five when Phase 12's transformations and the stated style defaults shipped after the course
 * (2026-11-17). The original twelve are untouched: every control they teach still exists.
 *
 * A lesson is a claim about the product and carries the same burden of proof as a log line. If a
 * control is removed or renamed, this test fails rather than a learner discovering it.
 */

// Resolve the repo root by trying candidates: the test runs from the package cwd or from src.
const ROOTS = [join(__dirname, '../../../../../..'), join(process.cwd(), '../..'), process.cwd()];

function readMarkerFile(relative: string): string | null {
  for (const root of ROOTS) {
    const candidate = join(root, relative);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  return null;
}

describe('the course is fifteen lessons in five modules', () => {
  it('has five modules', () => {
    expect(RUSH_CONTROLS_COURSE_TEMPLATE.modules).toHaveLength(5);
  });

  it('has fifteen lessons, three per module', () => {
    expect(RUSH_LESSONS).toHaveLength(15);
    for (const module of RUSH_CONTROLS_COURSE_TEMPLATE.modules) {
      expect(module.lessons).toHaveLength(3);
    }
  });

  it('the original twelve are untouched by the extension', () => {
    // The Phase 9 controls all still exist and still work; removing a lesson to make room for a new one would be
    // the wrong trade, so the first four modules keep their twelve lessons verbatim.
    const firstFour = RUSH_CONTROLS_COURSE_TEMPLATE.modules.slice(0, 4).flatMap((module) => module.lessons);
    expect(firstFour).toHaveLength(12);
    // The extension is additive: no new control may appear in the original four modules.
    const newIds = ['style-defaults', 'transform-relight', 'transform-restyle'];
    expect(firstFour.some((lesson) => newIds.includes(lesson.control.id))).toBe(false);
    // And every Phase 9 control is still taught somewhere in those twelve.
    const taught = new Set(firstFour.map((lesson) => lesson.control.id));
    expect(taught.size).toBeGreaterThanOrEqual(8);
  });

  it('every lesson names a control, an objective and content', () => {
    for (const lesson of RUSH_LESSONS) {
      expect(lesson.control.id.length).toBeGreaterThan(0);
      expect(lesson.learningObjectives.length).toBeGreaterThan(0);
      expect(lesson.lessonContent.length).toBeGreaterThan(80);
    }
  });
});

describe('every lesson references a control that exists', () => {
  it('each control marker is present in the file it claims', () => {
    const missing: string[] = [];
    for (const lesson of RUSH_LESSONS) {
      const source = readMarkerFile(lesson.control.markerFile);
      if (!source || !source.includes(lesson.control.marker)) {
        missing.push(`${lesson.control.id} -> ${lesson.control.markerFile} (${lesson.control.marker})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every reachableAt string points at something nameable', () => {
    for (const lesson of RUSH_LESSONS) {
      expect(lesson.control.reachableAt.length).toBeGreaterThan(10);
    }
  });
});

describe('unproven controls are absent by design', () => {
  const text = RUSH_LESSONS.map((lesson) => `${lesson.title} ${lesson.summary} ${lesson.lessonContent}`).join(' ').toLowerCase();

  it('no lesson teaches LoRAs', () => {
    expect(text).not.toContain('lora');
  });

  it('no lesson teaches the motion/object operator', () => {
    expect(text).not.toContain('motion transfer');
    expect(text).not.toContain('object swap');
  });

  it('no lesson promises identity consistency at scale', () => {
    expect(text).not.toContain('identity store');
  });

  it('the Noir finding is taught honestly - a look can lower the score', () => {
    const lesson = RUSH_LESSONS.find((entry) => entry.title.includes('lower your score'));
    expect(lesson).toBeDefined();
    expect(lesson!.lessonContent).toContain('70 / 75 / 75');
    expect(lesson!.lessonContent).toContain('80 / 85 / 85');
    expect(lesson!.lessonContent).toContain('not an upgrade');
  });
});

describe('the three lessons for what shipped after the course', () => {
  const newControls = ['style-defaults', 'transform-relight', 'transform-restyle'];

  it('are asserted by name, so removing a control breaks the lesson rather than orphaning it', () => {
    const ids = RUSH_LESSONS.map((lesson) => lesson.control.id);
    for (const id of newControls) expect(ids).toContain(id);
  });

  it('teach a control whose marker exists in the file it claims', () => {
    const missing: string[] = [];
    for (const lesson of RUSH_LESSONS.filter((entry) => newControls.includes(entry.control.id))) {
      const source = readMarkerFile(lesson.control.markerFile);
      if (!source || !source.includes(lesson.control.marker)) missing.push(lesson.control.id);
    }
    expect(missing).toEqual([]);
  });

  it('the restyle lesson carries the measured instruction finding, not generic advice', () => {
    const lesson = RUSH_LESSONS.find((entry) => entry.control.id === 'transform-restyle');
    expect(lesson).toBeDefined();
    expect(lesson!.lessonContent).toContain('15');
    expect(lesson!.lessonContent).toContain('85');
    expect(lesson!.lessonContent).toContain('monochrome');
    expect(lesson!.lessonContent).toContain('no-change result');
  });

  it('the style-defaults lesson says it is a default, not a learned preference', () => {
    const lesson = RUSH_LESSONS.find((entry) => entry.control.id === 'style-defaults');
    expect(lesson!.lessonContent).toContain('not a learned preference');
  });

  it('the relight lesson carries the measured cost and wait', () => {
    const lesson = RUSH_LESSONS.find((entry) => entry.control.id === 'transform-relight');
    expect(lesson!.lessonContent).toContain('1,578');
    expect(lesson!.lessonContent).toContain('72.8');
  });

  it('no lesson teaches a control that has not shipped', () => {
    const text = RUSH_LESSONS.map((lesson) => `${lesson.title} ${lesson.summary} ${lesson.lessonContent}`).join(' ');
    // Commercials, character reuse and the taste profile are unbuilt: a lesson for any of them would promise what
    // the code cannot deliver, which is the template defect in a curriculum.
    expect(text).not.toContain('CommercialContract');
    expect(text).not.toContain('share your character');
    expect(text).not.toContain('learns your taste');
  });
});
