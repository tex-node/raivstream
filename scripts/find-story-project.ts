import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

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
  console.error('Usage: pnpm exec tsx scripts/find-story-project.ts <projectId>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.storyProject.findUnique({
    where: { id: projectId },
    include: {
      user: { select: { id: true, email: true, role: true } },
      _count: {
        select: {
          chapters: true,
          sceneSeeds: true,
        },
      },
      sceneSeeds: {
        select: {
          id: true,
          _count: { select: { assets: true } },
        },
      },
    },
  });

  if (!project) {
    console.log(JSON.stringify({ projectId, exists: false }, null, 2));
    return;
  }

  const assetsCount = project.sceneSeeds.reduce((sum, scene) => sum + scene._count.assets, 0);
  console.log(JSON.stringify({
    projectId: project.id,
    exists: true,
    title: project.title,
    status: project.status,
    audienceMode: project.audienceMode,
    owner: project.user,
    counts: {
      chapters: project._count.chapters,
      scenes: project._count.sceneSeeds,
      assets: assetsCount,
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
