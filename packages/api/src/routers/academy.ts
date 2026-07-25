import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure, type Context } from '../trpc';
import { FILMMAKING_COURSE_TEMPLATE, FINAL_PROJECT_RUBRIC } from '../lib/academyTemplates';

const membershipRoleSchema = z.enum(['INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT']);
const classStatusSchema = z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
const assignmentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);
const deliverableTypeSchema = z.enum([
  'STORY_IDEA',
  'STORY_DNA',
  'CHARACTER_PROFILE',
  'SCENE_PLAN',
  'STORYBOARD',
  'IMAGE_SEQUENCE',
  'STORYBOOK',
  'FINAL_VIDEO',
  'ADVERT',
  'SHORT_FILM',
  'PSA',
  'REFLECTION',
]);
const submissionStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'GRADED']);
const commentTargetTypeSchema = z.enum(['STORY', 'CHARACTER', 'SCENE', 'ASSET', 'STORYBOOK', 'SUBMISSION']);
const progressStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

const rubricCriterionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  maximumPoints: z.number().min(0).max(100),
  performanceLevels: z.any().optional(),
  orderIndex: z.number().int().min(1).max(100).optional(),
});

const isAdmin = (ctx: Context) => ctx.user?.role === 'ADMIN';

async function trackAcademy(ctx: Context, eventName: string, properties: Record<string, unknown> = {}) {
  await (ctx.prisma as any).analyticsEvent.create({
    data: {
      userId: ctx.user?.id,
      eventName,
      properties,
    },
  });
}

async function notifyAcademy(ctx: Context, input: { recipientId: string; senderId?: string; type: string }) {
  if (!ctx.user?.id || input.recipientId === ctx.user.id) return;
  try {
    await (ctx.prisma as any).notification.create({
      data: {
        recipientId: input.recipientId,
        senderId: input.senderId ?? ctx.user.id,
        type: input.type,
      },
    });
  } catch {
    // Notifications must not block Academy state changes.
  }
}

function makeInviteCode() {
  return `RAIV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function getMembership(ctx: Context, classId: string, userId = ctx.user!.id) {
  return (ctx.prisma as any).academyClassMembership.findFirst({
    where: { classId, userId, status: { in: ['ACTIVE', 'INVITED', 'COMPLETED'] } },
    include: { class: true },
  });
}

async function requireClassAccess(ctx: Context, classId: string) {
  const klass = await (ctx.prisma as any).academyClass.findUnique({
    where: { id: classId },
    include: { course: true },
  });
  if (!klass) throw new TRPCError({ code: 'NOT_FOUND', message: 'Academy class not found.' });
  if (isAdmin(ctx) || klass.instructorId === ctx.user!.id || klass.course.ownerId === ctx.user!.id) return { class: klass, role: 'INSTRUCTOR' as const };
  const membership = await getMembership(ctx, classId);
  if (!membership || membership.status === 'REMOVED') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this Academy class.' });
  }
  return { class: klass, role: membership.role as 'INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'STUDENT', membership };
}

async function requireInstructorAccess(ctx: Context, classId: string) {
  const access = await requireClassAccess(ctx, classId);
  if (isAdmin(ctx) || access.class.instructorId === ctx.user!.id || access.class.course.ownerId === ctx.user!.id) return access;
  if (access.role !== 'INSTRUCTOR' && access.role !== 'TEACHING_ASSISTANT') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Instructor access required for this Academy class.' });
  }
  return access;
}

async function requireCourseOwner(ctx: Context, courseId: string) {
  const course = await (ctx.prisma as any).academyCourse.findUnique({ where: { id: courseId } });
  if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Academy course not found.' });
  if (!isAdmin(ctx) && course.ownerId !== ctx.user!.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Course owner access required.' });
  }
  return course;
}

async function getAssignmentWithAccess(ctx: Context, assignmentId: string) {
  const assignment = await (ctx.prisma as any).academyAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: { include: { course: true } },
      lesson: { include: { module: true } },
    },
  });
  if (!assignment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Assignment not found.' });
  const access = await requireClassAccess(ctx, assignment.classId);
  if (access.role === 'STUDENT' && assignment.status === 'DRAFT') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This assignment is not published yet.' });
  }
  return { assignment, access };
}

async function getSubmissionWithAccess(ctx: Context, submissionId: string) {
  const submission = await (ctx.prisma as any).academySubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: { select: { id: true, displayName: true, username: true, email: true } },
      project: {
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' } },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: { assets: { where: { assetType: 'IMAGE', status: 'READY', deletedAt: null }, orderBy: { createdAt: 'desc' } } },
          },
        },
      },
      assignment: { include: { class: { include: { course: true } }, lesson: true } },
      rubricScores: { orderBy: { orderIndex: 'asc' } },
      comments: { orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, displayName: true, username: true, role: true } } } },
    },
  });
  if (!submission) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found.' });
  const access = await requireClassAccess(ctx, submission.assignment.classId);
  const reviewer = access.role === 'INSTRUCTOR' || access.role === 'TEACHING_ASSISTANT' || isAdmin(ctx);
  if (!reviewer && submission.studentId !== ctx.user!.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Students cannot view another student submission.' });
  }
  return { submission, access, reviewer };
}

async function buildSubmissionSnapshot(ctx: Context, projectId: string) {
  const project = await (ctx.prisma as any).storyProject.findFirst({
    where: { id: projectId, userId: ctx.user!.id },
    include: {
      characterMemory: true,
      sceneSeeds: {
        orderBy: { orderIndex: 'asc' },
        include: { assets: { where: { assetType: 'IMAGE', status: 'READY', deletedAt: null }, select: { id: true } } },
      },
    },
  });
  if (!project) throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only submit your own Story Workspace project.' });
  const activeAssetIds = project.sceneSeeds
    .map((scene: any) => scene.activeImageAssetId ?? scene.latestImageAssetId ?? scene.assets?.[0]?.id)
    .filter(Boolean);
  return {
    projectId: project.id,
    projectTitle: project.title,
    projectStatus: project.status,
    storyDnaSummary: project.storyDna ? {
      theme: (project.storyDna as any).theme ?? project.theme,
      hero: (project.storyDna as any).hero,
      primaryGoal: (project.storyDna as any).primaryGoal,
    } : null,
    characterCount: project.characterMemory.length,
    sceneCount: project.sceneSeeds.length,
    activeAssetIds,
    storybookReady: project.sceneSeeds.length > 0 && project.sceneSeeds.every((scene: any) => scene.imageUrl || scene.activeImageAssetId || scene.latestImageAssetId),
    submittedAt: new Date().toISOString(),
  };
}

async function createTemplateCourse(ctx: Context, titleSuffix = '') {
  const course = await (ctx.prisma as any).academyCourse.create({
    data: {
      ownerId: ctx.user!.id,
      title: `${FILMMAKING_COURSE_TEMPLATE.title}${titleSuffix}`,
      description: FILMMAKING_COURSE_TEMPLATE.description,
      learningOutcome: FILMMAKING_COURSE_TEMPLATE.learningOutcome,
      audienceDescription: FILMMAKING_COURSE_TEMPLATE.audienceDescription,
      durationWeeks: FILMMAKING_COURSE_TEMPLATE.durationWeeks,
      sessionsPerWeek: FILMMAKING_COURSE_TEMPLATE.sessionsPerWeek,
      sessionDurationMinutes: FILMMAKING_COURSE_TEMPLATE.sessionDurationMinutes,
      status: 'DRAFT',
    },
  });

  const lessons: any[] = [];
  for (const [moduleIndex, moduleTemplate] of FILMMAKING_COURSE_TEMPLATE.modules.entries()) {
    const module = await (ctx.prisma as any).academyCourseModule.create({
      data: {
        courseId: course.id,
        title: moduleTemplate.title,
        description: moduleTemplate.description,
        orderIndex: moduleIndex + 1,
      },
    });
    for (const [lessonIndex, lessonTemplate] of moduleTemplate.lessons.entries()) {
      lessons.push(await (ctx.prisma as any).academyLesson.create({
        data: {
          moduleId: module.id,
          title: lessonTemplate.title,
          summary: lessonTemplate.summary,
          learningObjectives: lessonTemplate.learningObjectives,
          lessonContent: lessonTemplate.lessonContent,
          estimatedMinutes: lessonTemplate.estimatedMinutes,
          lessonType: lessonTemplate.lessonType,
          status: 'PUBLISHED',
          orderIndex: lessonIndex + 1,
        },
      }));
    }
  }
  return { course, lessons };
}

export const academyRouter = router({
  templates: protectedProcedure.query(() => ({
    filmmaking: FILMMAKING_COURSE_TEMPLATE,
    finalProjectRubric: FINAL_PROJECT_RUBRIC,
  })),

  createCourseFromTemplate: protectedProcedure.mutation(async ({ ctx }) => {
    const created = await createTemplateCourse(ctx);
    await trackAcademy(ctx, 'course_created', { courseId: created.course.id, source: 'template' });
    return created.course;
  }),

  createCourse: protectedProcedure
    .input(z.object({
      title: z.string().min(3).max(160),
      description: z.string().max(2000).optional(),
      learningOutcome: z.string().max(1000).optional(),
      audienceDescription: z.string().max(1000).optional(),
      durationWeeks: z.number().int().min(1).max(52).optional(),
      sessionsPerWeek: z.number().int().min(1).max(7).optional(),
      sessionDurationMinutes: z.number().int().min(15).max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const course = await (ctx.prisma as any).academyCourse.create({
        data: { ...input, ownerId: ctx.user.id, status: 'DRAFT' },
      });
      await trackAcademy(ctx, 'course_created', { courseId: course.id });
      return course;
    }),

  listMyCourses: protectedProcedure.query(({ ctx }) =>
    (ctx.prisma as any).academyCourse.findMany({
      where: isAdmin(ctx) ? {} : { ownerId: ctx.user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { classes: true, modules: true } } },
    })),

  createClass: protectedProcedure
    .input(z.object({
      courseId: z.string(),
      title: z.string().min(3).max(160),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      maximumStudents: z.number().int().min(1).max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireCourseOwner(ctx, input.courseId);
      let inviteCode = makeInviteCode();
      for (let i = 0; i < 5; i += 1) {
        const existing = await (ctx.prisma as any).academyClass.findUnique({ where: { inviteCode } });
        if (!existing) break;
        inviteCode = makeInviteCode();
      }
      const klass = await (ctx.prisma as any).academyClass.create({
        data: {
          courseId: input.courseId,
          title: input.title,
          instructorId: ctx.user.id,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          maximumStudents: input.maximumStudents,
          inviteCode,
          status: 'ACTIVE',
        },
      });
      await (ctx.prisma as any).academyClassMembership.upsert({
        where: { classId_userId: { classId: klass.id, userId: ctx.user.id } },
        update: { role: 'INSTRUCTOR', status: 'ACTIVE', lastActiveAt: new Date() },
        create: { classId: klass.id, userId: ctx.user.id, role: 'INSTRUCTOR', status: 'ACTIVE', lastActiveAt: new Date() },
      });
      await trackAcademy(ctx, 'class_created', { courseId: input.courseId, classId: klass.id });
      return klass;
    }),

  joinClass: protectedProcedure
    .input(z.object({ inviteCode: z.string().min(4).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const klass = await (ctx.prisma as any).academyClass.findUnique({ where: { inviteCode: input.inviteCode.trim().toUpperCase() } });
      if (!klass) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite code not found.' });
      if (!klass.enrollmentOpen) throw new TRPCError({ code: 'FORBIDDEN', message: 'Enrollment is closed for this class.' });
      if (klass.status === 'ARCHIVED' || klass.status === 'COMPLETED') throw new TRPCError({ code: 'FORBIDDEN', message: 'This class is no longer accepting students.' });
      if (klass.maximumStudents) {
        const count = await (ctx.prisma as any).academyClassMembership.count({ where: { classId: klass.id, role: 'STUDENT', status: 'ACTIVE' } });
        if (count >= klass.maximumStudents) throw new TRPCError({ code: 'FORBIDDEN', message: 'This class is full.' });
      }
      const membership = await (ctx.prisma as any).academyClassMembership.upsert({
        where: { classId_userId: { classId: klass.id, userId: ctx.user.id } },
        update: { role: 'STUDENT', status: 'ACTIVE', lastActiveAt: new Date() },
        create: { classId: klass.id, userId: ctx.user.id, role: 'STUDENT', status: 'ACTIVE', lastActiveAt: new Date() },
      });
      await notifyAcademy(ctx, { recipientId: klass.instructorId, type: 'ACADEMY_STUDENT_JOINED' });
      await trackAcademy(ctx, 'student_joined_class', { classId: klass.id });
      return membership;
    }),

  studentDashboard: protectedProcedure.query(async ({ ctx }) => {
    await trackAcademy(ctx, 'academy_opened', { surface: 'student_dashboard' });
    const memberships = await (ctx.prisma as any).academyClassMembership.findMany({
      where: { userId: ctx.user.id, role: 'STUDENT', status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: {
        class: {
          include: {
            course: { include: { modules: { orderBy: { orderIndex: 'asc' }, include: { lessons: { orderBy: { orderIndex: 'asc' } } } } } },
            assignments: { where: { status: { in: ['PUBLISHED', 'CLOSED'] } }, orderBy: { dueAt: 'asc' }, include: { submissions: { where: { studentId: ctx.user.id }, orderBy: { updatedAt: 'desc' }, take: 1 } } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    const feedback = await (ctx.prisma as any).academyComment.findMany({
      where: { submission: { studentId: ctx.user.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { submission: { include: { assignment: true } }, author: { select: { displayName: true, username: true } } },
    });
    return { memberships, feedback };
  }),

  instructorDashboard: protectedProcedure.query(async ({ ctx }) => {
    await trackAcademy(ctx, 'academy_opened', { surface: 'instructor_dashboard' });
    const classes = await (ctx.prisma as any).academyClass.findMany({
      where: isAdmin(ctx) ? {} : {
        OR: [
          { instructorId: ctx.user.id },
          { memberships: { some: { userId: ctx.user.id, role: { in: ['INSTRUCTOR', 'TEACHING_ASSISTANT'] }, status: 'ACTIVE' } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: true,
        memberships: { include: { user: { select: { id: true, displayName: true, username: true, email: true } } } },
        assignments: { include: { submissions: true } },
      },
    });
    const classIds = classes.map((klass: any) => klass.id);
    const awaitingReview = classIds.length ? await (ctx.prisma as any).academySubmission.findMany({
      where: { assignment: { classId: { in: classIds } }, status: { in: ['SUBMITTED', 'RESUBMITTED', 'IN_REVIEW'] } },
      orderBy: { submittedAt: 'asc' },
      take: 25,
      include: { student: { select: { displayName: true, username: true } }, assignment: { include: { class: true } } },
    }) : [];
    return { classes, awaitingReview };
  }),

  getClass: protectedProcedure
    .input(z.object({ classId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClassAccess(ctx, input.classId);
      return (ctx.prisma as any).academyClass.findUnique({
        where: { id: input.classId },
        include: {
          course: { include: { modules: { orderBy: { orderIndex: 'asc' }, include: { lessons: { orderBy: { orderIndex: 'asc' }, include: { progress: { where: { userId: ctx.user.id, classId: input.classId } } } } } } } },
          memberships: { orderBy: { joinedAt: 'asc' }, include: { user: { select: { id: true, displayName: true, username: true, email: true } } } },
          assignments: { orderBy: { createdAt: 'asc' }, include: { submissions: { where: isAdmin(ctx) ? {} : { OR: [{ studentId: ctx.user.id }, { assignment: { class: { instructorId: ctx.user.id } } }] }, include: { student: { select: { id: true, displayName: true, username: true } } } } } },
        },
      });
    }),

  getLesson: protectedProcedure
    .input(z.object({ classId: z.string(), lessonId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClassAccess(ctx, input.classId);
      const lesson = await (ctx.prisma as any).academyLesson.findUnique({
        where: { id: input.lessonId },
        include: { module: true, assignments: { where: { classId: input.classId }, orderBy: { createdAt: 'asc' } }, progress: { where: { userId: ctx.user.id, classId: input.classId } } },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found.' });
      await (ctx.prisma as any).academyLessonProgress.upsert({
        where: { lessonId_userId_classId: { lessonId: input.lessonId, userId: ctx.user.id, classId: input.classId } },
        update: { startedAt: lesson.progress?.[0]?.startedAt ?? new Date(), status: lesson.progress?.[0]?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS' },
        create: { lessonId: input.lessonId, userId: ctx.user.id, classId: input.classId, status: 'IN_PROGRESS', startedAt: new Date() },
      });
      await trackAcademy(ctx, 'lesson_opened', { classId: input.classId, lessonId: input.lessonId });
      return lesson;
    }),

  updateLessonProgress: protectedProcedure
    .input(z.object({ classId: z.string(), lessonId: z.string(), status: progressStatusSchema, lastPosition: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireClassAccess(ctx, input.classId);
      const progress = await (ctx.prisma as any).academyLessonProgress.upsert({
        where: { lessonId_userId_classId: { lessonId: input.lessonId, userId: ctx.user.id, classId: input.classId } },
        update: {
          status: input.status,
          lastPosition: input.lastPosition,
          startedAt: input.status !== 'NOT_STARTED' ? new Date() : undefined,
          completedAt: input.status === 'COMPLETED' ? new Date() : null,
        },
        create: {
          lessonId: input.lessonId,
          userId: ctx.user.id,
          classId: input.classId,
          status: input.status,
          lastPosition: input.lastPosition,
          startedAt: input.status !== 'NOT_STARTED' ? new Date() : null,
          completedAt: input.status === 'COMPLETED' ? new Date() : null,
        },
      });
      if (input.status === 'COMPLETED') await trackAcademy(ctx, 'lesson_completed', { classId: input.classId, lessonId: input.lessonId });
      return progress;
    }),

  createAssignment: protectedProcedure
    .input(z.object({
      classId: z.string(),
      lessonId: z.string().optional(),
      title: z.string().min(3).max(160),
      brief: z.string().min(3).max(1000),
      instructions: z.string().max(5000).optional(),
      deliverableType: deliverableTypeSchema,
      dueAt: z.string().optional(),
      maximumScore: z.number().min(0).max(1000).default(100),
      rubric: z.array(rubricCriterionSchema).optional(),
      allowResubmission: z.boolean().default(true),
      maximumAttempts: z.number().int().min(1).max(20).optional(),
      requiredWorkspaceStage: z.string().max(80).optional(),
      status: assignmentStatusSchema.default('DRAFT'),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireInstructorAccess(ctx, input.classId);
      const assignment = await (ctx.prisma as any).academyAssignment.create({
        data: {
          classId: input.classId,
          lessonId: input.lessonId,
          title: input.title,
          brief: input.brief,
          instructions: input.instructions,
          deliverableType: input.deliverableType,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          maximumScore: input.maximumScore,
          rubric: input.rubric ?? FINAL_PROJECT_RUBRIC,
          allowResubmission: input.allowResubmission,
          maximumAttempts: input.maximumAttempts,
          requiredWorkspaceStage: input.requiredWorkspaceStage,
          status: input.status,
        },
      });
      if (assignment.status === 'PUBLISHED') {
        const students = await (ctx.prisma as any).academyClassMembership.findMany({ where: { classId: input.classId, role: 'STUDENT', status: 'ACTIVE' }, select: { userId: true } });
        await Promise.all(students.map((student: any) => notifyAcademy(ctx, { recipientId: student.userId, type: 'ACADEMY_ASSIGNMENT_PUBLISHED' })));
      }
      await trackAcademy(ctx, 'assignment_started', { classId: input.classId, assignmentId: assignment.id, status: assignment.status });
      return assignment;
    }),

  createTemplateAssignments: protectedProcedure
    .input(z.object({ classId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const access = await requireInstructorAccess(ctx, input.classId);
      const lessons = await (ctx.prisma as any).academyLesson.findMany({
        where: { module: { courseId: access.class.courseId } },
        orderBy: [{ module: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      });
      const created = [];
      for (const [index, template] of FILMMAKING_COURSE_TEMPLATE.assignments.entries()) {
        created.push(await (ctx.prisma as any).academyAssignment.create({
          data: {
            classId: input.classId,
            lessonId: lessons[Math.min(index * 2, Math.max(lessons.length - 1, 0))]?.id,
            title: template.title,
            brief: template.brief,
            instructions: template.instructions,
            deliverableType: template.deliverableType,
            requiredWorkspaceStage: template.requiredWorkspaceStage,
            maximumScore: template.maximumScore,
            rubric: template.rubric,
            status: 'PUBLISHED',
          },
        }));
      }
      await trackAcademy(ctx, 'assignment_started', { classId: input.classId, source: 'template', count: created.length });
      return created;
    }),

  getAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { assignment } = await getAssignmentWithAccess(ctx, input.assignmentId);
      await trackAcademy(ctx, 'assignment_opened', { classId: assignment.classId, assignmentId: assignment.id });
      const mySubmission = await (ctx.prisma as any).academySubmission.findFirst({
        where: { assignmentId: input.assignmentId, studentId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        include: { comments: { orderBy: { createdAt: 'desc' }, include: { author: { select: { displayName: true, username: true } } } }, rubricScores: { orderBy: { orderIndex: 'asc' } }, project: { select: { id: true, title: true, status: true, updatedAt: true } } },
      });
      return { assignment, mySubmission };
    }),

  getWorkspaceAssignmentContext: protectedProcedure
    .input(z.object({ assignmentId: z.string(), projectId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { assignment } = await getAssignmentWithAccess(ctx, input.assignmentId);
      if (input.projectId) {
        const project = await (ctx.prisma as any).storyProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id }, select: { id: true } });
        if (!project) throw new TRPCError({ code: 'FORBIDDEN', message: 'Academy assignment can only be attached to your own project.' });
      }
      await trackAcademy(ctx, 'academy_workspace_opened', { classId: assignment.classId, assignmentId: assignment.id, projectId: input.projectId });
      return {
        assignmentId: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        brief: assignment.brief,
        instructions: assignment.instructions,
        requiredWorkspaceStage: assignment.requiredWorkspaceStage,
      };
    }),

  submitAssignment: protectedProcedure
    .input(z.object({
      assignmentId: z.string(),
      projectId: z.string().optional(),
      submittedAssetId: z.string().optional(),
      submissionText: z.string().max(8000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { assignment, access } = await getAssignmentWithAccess(ctx, input.assignmentId);
      if (access.role !== 'STUDENT') throw new TRPCError({ code: 'FORBIDDEN', message: 'Only students submit assignments.' });
      const latest = await (ctx.prisma as any).academySubmission.findFirst({
        where: { assignmentId: input.assignmentId, studentId: ctx.user.id },
        orderBy: { attemptNumber: 'desc' },
      });
      if (latest && !assignment.allowResubmission && latest.status !== 'DRAFT') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Resubmission is not allowed for this assignment.' });
      }
      if (assignment.maximumAttempts && latest && latest.attemptNumber >= assignment.maximumAttempts && latest.status !== 'DRAFT') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Maximum submission attempts reached.' });
      }
      const snapshot = input.projectId ? await buildSubmissionSnapshot(ctx, input.projectId) : null;
      const nextStatus = latest?.status === 'REVISION_REQUESTED' ? 'RESUBMITTED' : 'SUBMITTED';
      const submission = latest?.status === 'DRAFT' || latest?.status === 'REVISION_REQUESTED'
        ? await (ctx.prisma as any).academySubmission.update({
          where: { id: latest.id },
          data: {
            projectId: input.projectId,
            submittedAssetId: input.submittedAssetId,
            submissionText: input.submissionText,
            snapshot,
            status: nextStatus,
            attemptNumber: latest.status === 'REVISION_REQUESTED' ? latest.attemptNumber + 1 : latest.attemptNumber,
            submittedAt: new Date(),
          },
        })
        : await (ctx.prisma as any).academySubmission.create({
          data: {
            assignmentId: input.assignmentId,
            studentId: ctx.user.id,
            projectId: input.projectId,
            submittedAssetId: input.submittedAssetId,
            submissionText: input.submissionText,
            snapshot,
            status: 'SUBMITTED',
            attemptNumber: latest ? latest.attemptNumber + 1 : 1,
            submittedAt: new Date(),
          },
        });
      await notifyAcademy(ctx, { recipientId: assignment.class.instructorId, type: 'ACADEMY_SUBMISSION_RECEIVED' });
      await trackAcademy(ctx, latest?.status === 'REVISION_REQUESTED' ? 'assignment_resubmitted' : 'assignment_submitted', {
        classId: assignment.classId,
        assignmentId: assignment.id,
        submissionId: submission.id,
        projectId: input.projectId,
      });
      return submission;
    }),

  getSubmission: protectedProcedure
    .input(z.object({ submissionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await getSubmissionWithAccess(ctx, input.submissionId);
      return { ...result.submission, reviewer: result.reviewer };
    }),

  addComment: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      targetType: commentTargetTypeSchema,
      targetId: z.string().optional(),
      body: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { submission, reviewer } = await getSubmissionWithAccess(ctx, input.submissionId);
      if (!reviewer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only instructors can comment on submissions.' });
      const comment = await (ctx.prisma as any).academyComment.create({
        data: {
          submissionId: input.submissionId,
          authorId: ctx.user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          body: input.body,
        },
      });
      await notifyAcademy(ctx, { recipientId: submission.studentId, type: 'ACADEMY_COMMENT_ADDED' });
      await trackAcademy(ctx, 'instructor_comment_added', { assignmentId: submission.assignmentId, submissionId: input.submissionId, targetType: input.targetType });
      return comment;
    }),

  reviewSubmission: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      status: submissionStatusSchema,
      instructorSummary: z.string().max(4000).optional(),
      score: z.number().min(0).max(1000).optional(),
      rubricScores: z.array(z.object({
        criterionId: z.string(),
        title: z.string(),
        maximumPoints: z.number(),
        score: z.number(),
        notes: z.string().optional(),
        orderIndex: z.number().int().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { submission, reviewer } = await getSubmissionWithAccess(ctx, input.submissionId);
      if (!reviewer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only instructors can review submissions.' });
      const updated = await (ctx.prisma as any).academySubmission.update({
        where: { id: input.submissionId },
        data: {
          status: input.status,
          instructorSummary: input.instructorSummary,
          score: input.score,
          reviewedAt: new Date(),
        },
      });
      if (input.rubricScores?.length) {
        await Promise.all(input.rubricScores.map((score, index) =>
          (ctx.prisma as any).academyRubricScore.upsert({
            where: { submissionId_criterionId: { submissionId: input.submissionId, criterionId: score.criterionId } },
            update: { title: score.title, maximumPoints: score.maximumPoints, score: score.score, notes: score.notes, orderIndex: score.orderIndex ?? index + 1 },
            create: { submissionId: input.submissionId, criterionId: score.criterionId, title: score.title, maximumPoints: score.maximumPoints, score: score.score, notes: score.notes, orderIndex: score.orderIndex ?? index + 1 },
          }),
        ));
      }
      const eventByStatus: Record<string, string> = {
        REVISION_REQUESTED: 'submission_revision_requested',
        APPROVED: 'submission_approved',
        GRADED: 'submission_graded',
      };
      const notificationByStatus: Record<string, string> = {
        REVISION_REQUESTED: 'ACADEMY_REVISION_REQUESTED',
        APPROVED: 'ACADEMY_SUBMISSION_APPROVED',
        GRADED: 'ACADEMY_GRADE_RELEASED',
      };
      if (notificationByStatus[input.status]) await notifyAcademy(ctx, { recipientId: submission.studentId, type: notificationByStatus[input.status] });
      await trackAcademy(ctx, eventByStatus[input.status] ?? 'submission_reviewed', { submissionId: input.submissionId, assignmentId: submission.assignmentId, status: input.status });
      return updated;
    }),

  listStudentProjects: protectedProcedure.query(({ ctx }) =>
    (ctx.prisma as any).storyProject.findMany({
      where: { userId: ctx.user.id, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, originalIdea: true, status: true, updatedAt: true },
    })),

  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required.' });
    const [courses, classes, memberships, submissions, awaitingReview] = await Promise.all([
      (ctx.prisma as any).academyCourse.count(),
      (ctx.prisma as any).academyClass.count(),
      (ctx.prisma as any).academyClassMembership.count({ where: { status: 'ACTIVE' } }),
      (ctx.prisma as any).academySubmission.count(),
      (ctx.prisma as any).academySubmission.count({ where: { status: { in: ['SUBMITTED', 'RESUBMITTED', 'IN_REVIEW'] } } }),
    ]);
    const recentClasses = await (ctx.prisma as any).academyClass.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { course: true, instructor: { select: { displayName: true, username: true } }, _count: { select: { memberships: true, assignments: true } } },
    });
    return { courses, classes, memberships, submissions, awaitingReview, recentClasses };
  }),
});
