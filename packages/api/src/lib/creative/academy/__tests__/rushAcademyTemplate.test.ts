import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUSH_CONTROLS_COURSE_TEMPLATE, RUSH_LESSONS } from '../rushAcademyTemplate';

/**
 * Phase 9's exit criterion, as a test (2026-11-08).
 *
 * "Twelve lessons / four modules, each referencing a control a creator can actually reach."
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

describe('the course is twelve lessons in four modules', () => {
  it('has four modules', () => {
    expect(RUSH_CONTROLS_COURSE_TEMPLATE.modules).toHaveLength(4);
  });

  it('has twelve lessons, three per module', () => {
    expect(RUSH_LESSONS).toHaveLength(12);
    for (const module of RUSH_CONTROLS_COURSE_TEMPLATE.modules) {
      expect(module.lessons).toHaveLength(3);
    }
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
