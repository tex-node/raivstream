/**
 * D-004 Phase 1 - development seed for a test organization.
 *
 * Creates `test-school`, adds a STUDENT by email and an ORG_MODERATOR, then
 * prints the exact URLs to open. Idempotent: re-running updates the memberships
 * rather than duplicating the org.
 *
 * Usage:
 *   pnpm tsx scripts/seed-test-org.ts [student-email] [moderator-email]
 */

import { createHash } from 'node:crypto';
// Use the workspace client so the generated schema is the one the API uses.\nimport { prisma } from '@raivstream/database';

const ORG_SLUG = 'test-school';
const DEFAULT_STUDENT = 'texdevices@gmail.com';
const DEFAULT_MODERATOR = 'mod@test-school.com';

/** Placeholder credential - this account is for staging/testing only. */
function devPasswordHash(email: string): string {
  // Not bcrypt: this seed only needs a non-null unused hash. The account is
  // created for testing and should be given a real password through the app.
  return `seed-not-login-${createHash('sha256').update(email).digest('hex')}`;
}

async function main() {
  const studentEmail = process.argv[2] ?? DEFAULT_STUDENT;
  const moderatorEmail = process.argv[3] ?? DEFAULT_MODERATOR;

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: { name: 'Test School', slug: ORG_SLUG, type: 'SCHOOL' },
    select: { id: true, name: true, slug: true },
  });

  const student = await prisma.user.findUnique({ where: { email: studentEmail }, select: { id: true, username: true } });
  if (!student) {
    throw new Error(`No account for student email ${studentEmail}. Students must sign up first (Phase 1 does not create accounts).`);
  }

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: student.id } },
    update: { role: 'STUDENT', status: 'ACTIVE' },
    create: { organizationId: org.id, userId: student.id, role: 'STUDENT', status: 'ACTIVE' },
  });

  let moderator = await prisma.user.findUnique({ where: { email: moderatorEmail }, select: { id: true, username: true } });
  if (!moderator) {
    const username = moderatorEmail.split('@')[0]!.replace(/[^a-z0-9_]/gi, '').slice(0, 20) + '_mod';
    moderator = await prisma.user.create({
      data: {
        email: moderatorEmail,
        username,
        displayName: 'Test Org Moderator',
        passwordHash: devPasswordHash(moderatorEmail),
        role: 'CREATOR',
      },
      select: { id: true, username: true },
    });
    console.log(`[seed] created moderator account ${moderatorEmail} (username ${moderator.username})`);
  }

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: moderator.id } },
    update: { role: 'ORG_MODERATOR', status: 'ACTIVE' },
    create: { organizationId: org.id, userId: moderator.id, role: 'ORG_MODERATOR', status: 'ACTIVE' },
  });

  console.log('');
  console.log('=== D-004 test organization ready ===');
  console.log(`org:        ${org.name} (${org.slug})`);
  console.log(`orgId:      ${org.id}`);
  console.log(`student:    ${student.username} <${studentEmail}>`);
  console.log(`moderator:  ${moderator.username} <${moderatorEmail}>`);
  console.log('');
  console.log('Admin view:      /admin/organizations/' + org.id);
  console.log('Moderator view:  /org/' + org.slug + '   (sign in as the moderator)');
}

main()
  .catch((error) => {
    console.error('[seed] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });