import { prisma } from '../packages/database';
import { FILMMAKING_COURSE_TEMPLATE } from '../packages/api/src/lib/academyTemplates';

async function upsertUser(email: string, username: string, displayName: string) {
  return prisma.user.upsert({
    where: { email },
    update: { username, displayName, role: 'CREATOR', premiumTier: 'CREATOR' },
    create: {
      email,
      username,
      displayName,
      passwordHash: 'academy-demo-only',
      role: 'CREATOR',
      premiumTier: 'CREATOR',
      verified: true,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed Academy demo data in production.');
  }

  const instructor = await upsertUser('academy.instructor@raivstream.test', 'academy_instructor', 'Academy Instructor');
  const studentOne = await upsertUser('academy.student1@raivstream.test', 'academy_student_one', 'Academy Student One');
  const studentTwo = await upsertUser('academy.student2@raivstream.test', 'academy_student_two', 'Academy Student Two');

  const course = await prisma.academyCourse.create({
    data: {
      ownerId: instructor.id,
      title: FILMMAKING_COURSE_TEMPLATE.title,
      description: FILMMAKING_COURSE_TEMPLATE.description,
      learningOutcome: FILMMAKING_COURSE_TEMPLATE.learningOutcome,
      audienceDescription: FILMMAKING_COURSE_TEMPLATE.audienceDescription,
      durationWeeks: FILMMAKING_COURSE_TEMPLATE.durationWeeks,
      sessionsPerWeek: FILMMAKING_COURSE_TEMPLATE.sessionsPerWeek,
      sessionDurationMinutes: FILMMAKING_COURSE_TEMPLATE.sessionDurationMinutes,
      status: 'ACTIVE',
    },
  });

  const lessons = [];
  for (const [moduleIndex, moduleTemplate] of FILMMAKING_COURSE_TEMPLATE.modules.entries()) {
    const module = await prisma.academyCourseModule.create({
      data: {
        courseId: course.id,
        title: moduleTemplate.title,
        description: moduleTemplate.description,
        orderIndex: moduleIndex + 1,
      },
    });
    for (const [lessonIndex, lessonTemplate] of moduleTemplate.lessons.entries()) {
      lessons.push(await prisma.academyLesson.create({
        data: {
          moduleId: module.id,
          title: lessonTemplate.title,
          summary: lessonTemplate.summary,
          learningObjectives: lessonTemplate.learningObjectives,
          lessonContent: lessonTemplate.lessonContent,
          estimatedMinutes: lessonTemplate.estimatedMinutes,
          lessonType: lessonTemplate.lessonType as any,
          status: 'PUBLISHED',
          orderIndex: lessonIndex + 1,
        },
      }));
    }
  }

  const klass = await prisma.academyClass.create({
    data: {
      courseId: course.id,
      title: 'AI Filmmaking - Demo Cohort',
      instructorId: instructor.id,
      inviteCode: 'RAIV-DEMO7A',
      enrollmentOpen: true,
      status: 'ACTIVE',
    },
  });

  await Promise.all([
    prisma.academyClassMembership.create({ data: { classId: klass.id, userId: instructor.id, role: 'INSTRUCTOR', status: 'ACTIVE' } }),
    prisma.academyClassMembership.create({ data: { classId: klass.id, userId: studentOne.id, role: 'STUDENT', status: 'ACTIVE', progressPercent: 20 } }),
    prisma.academyClassMembership.create({ data: { classId: klass.id, userId: studentTwo.id, role: 'STUDENT', status: 'ACTIVE', progressPercent: 10 } }),
  ]);

  const assignments = [];
  for (const [index, assignmentTemplate] of FILMMAKING_COURSE_TEMPLATE.assignments.entries()) {
    assignments.push(await prisma.academyAssignment.create({
      data: {
        classId: klass.id,
        lessonId: lessons[Math.min(index * 2, lessons.length - 1)]?.id,
        title: assignmentTemplate.title,
        brief: assignmentTemplate.brief,
        instructions: assignmentTemplate.instructions,
        deliverableType: assignmentTemplate.deliverableType as any,
        requiredWorkspaceStage: assignmentTemplate.requiredWorkspaceStage,
        maximumScore: assignmentTemplate.maximumScore,
        rubric: assignmentTemplate.rubric,
        status: 'PUBLISHED',
      },
    }));
  }

  await prisma.academySubmission.create({
    data: {
      assignmentId: assignments[0].id,
      studentId: studentOne.id,
      submissionText: 'A young inventor builds a helpful robot for her community.',
      status: 'DRAFT',
    },
  });
  const submitted = await prisma.academySubmission.create({
    data: {
      assignmentId: assignments[1].id,
      studentId: studentOne.id,
      submissionText: 'The hero wants recognition but needs to learn collaboration.',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      snapshot: { projectTitle: 'Demo Character Arc', characterCount: 1, sceneCount: 0, storybookReady: false, submittedAt: new Date().toISOString() },
    },
  });
  const revision = await prisma.academySubmission.create({
    data: {
      assignmentId: assignments[2].id,
      studentId: studentTwo.id,
      submissionText: 'A medium shot with warm lighting shows the hero making a choice.',
      status: 'REVISION_REQUESTED',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      instructorSummary: 'Add a clearer reason for the camera angle and how it affects the audience.',
      snapshot: { projectTitle: 'Demo Scene Direction', characterCount: 1, sceneCount: 1, storybookReady: false, submittedAt: new Date().toISOString() },
    },
  });
  await prisma.academyComment.create({
    data: {
      submissionId: revision.id,
      authorId: instructor.id,
      targetType: 'SCENE',
      body: 'Use a wider establishing shot before this close-up.',
    },
  });

  console.log({ courseId: course.id, classId: klass.id, inviteCode: klass.inviteCode, submittedId: submitted.id, revisionId: revision.id });
}

main().finally(async () => {
  await prisma.$disconnect();
});
