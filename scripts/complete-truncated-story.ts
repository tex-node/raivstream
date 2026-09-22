#!/usr/bin/env tsx
/**
 * One-off ops script: regenerate a story project's narrative TEXT to
 * completion after an interrupted generation cut it off mid-sentence.
 *
 * Mirrors the `story.regenerateStoryText` proc: re-runs the narrative provider
 * with the project's original idea + answers, retries up to 3 times if the
 * draft still looks truncated, then updates the FIRST chapter's body/title/
 * summary. Scenes, characters and their assets are never touched.
 *
 * Usage (from repo root, on the VPS with the app env):
 *   pnpm exec tsx scripts/complete-truncated-story.ts <projectId>
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { storyTextService } from '../packages/api/src/lib/storyTextService';
import type { StoryAudienceMode } from '../packages/api/src/lib/storyTextService';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'apps', 'web', '.env.local'));
loadEnvFile(path.join(process.cwd(), 'packages', 'database', '.env'));

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: pnpm exec tsx scripts/complete-truncated-story.ts <projectId>');
  process.exit(1);
}

function isStoryBodyTruncated(body: string | null | undefined): boolean {
  const trimmed = (body ?? '').trim();
  if (!trimmed) return true;
  return !/[.!?…"'”’)\]]$/.test(trimmed);
}

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.storyProject.findUnique({
    where: { id: projectId },
    include: { questions: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const idea = project.originalIdea ?? project.logline ?? project.title ?? '';
  const answers = project.questions
    .filter((q) => q.selectedAnswer)
    .map((q) => ({ questionText: q.questionText, selectedAnswer: q.selectedAnswer as string }));
  const audienceMode = (project.audienceMode as StoryAudienceMode) ?? 'GENERAL';

  let body = '';
  let title = project.title ?? 'Untitled Story';
  let summary = '';
  let truncated = true;
  let attempts = 0;
  while (truncated && attempts < 3) {
    attempts += 1;
    const story = await storyTextService.generateStory(idea, answers, audienceMode, { userId: 'ops:complete-truncated-story' });
    body = story.body;
    title = story.title ?? title;
    summary = story.summary ?? summary;
    truncated = isStoryBodyTruncated(story.body);
    console.log(`attempt ${attempts}: ${body.length} chars, truncated=${truncated}`);
  }

  const firstChapter = await prisma.storyChapter.findFirst({
    where: { projectId: project.id },
    orderBy: { chapterNumber: 'asc' },
  });
  if (firstChapter) {
    await prisma.storyChapter.update({
      where: { id: firstChapter.id },
      data: { title, summary, body },
    });
  } else {
    await prisma.storyChapter.create({
      data: { projectId: project.id, chapterNumber: 1, title, summary, body },
    });
  }

  console.log(JSON.stringify({ projectId, attempts, truncated, bodyLength: body.length, title, head: body.slice(0, 160), tail: body.slice(-160) }, null, 2));
}

main()
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());