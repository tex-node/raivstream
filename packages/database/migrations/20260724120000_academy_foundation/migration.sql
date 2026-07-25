-- Phase 7A: Raivstream Academy foundation.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_STUDENT_JOINED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_ASSIGNMENT_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_SUBMISSION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_REVISION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_SUBMISSION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_GRADE_RELEASED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACADEMY_COMMENT_ADDED';

CREATE TYPE "AcademyCourseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "AcademyClassStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "AcademyMembershipRole" AS ENUM ('INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT');
CREATE TYPE "AcademyMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED', 'COMPLETED');
CREATE TYPE "AcademyLessonStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "AcademyLessonType" AS ENUM ('CLASSROOM', 'WORKSPACE', 'LAB', 'CRITIQUE', 'PRODUCTION');
CREATE TYPE "AcademyAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
CREATE TYPE "AcademyDeliverableType" AS ENUM ('STORY_IDEA', 'STORY_DNA', 'CHARACTER_PROFILE', 'SCENE_PLAN', 'STORYBOARD', 'IMAGE_SEQUENCE', 'STORYBOOK', 'FINAL_VIDEO', 'ADVERT', 'SHORT_FILM', 'PSA', 'REFLECTION');
CREATE TYPE "AcademySubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'GRADED');
CREATE TYPE "AcademyCommentTargetType" AS ENUM ('STORY', 'CHARACTER', 'SCENE', 'ASSET', 'STORYBOOK', 'SUBMISSION');
CREATE TYPE "AcademyLessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "academy_courses" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "learningOutcome" TEXT,
  "audienceDescription" TEXT,
  "durationWeeks" INTEGER,
  "sessionsPerWeek" INTEGER,
  "sessionDurationMinutes" INTEGER,
  "status" "AcademyCourseStatus" NOT NULL DEFAULT 'DRAFT',
  "coverImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_classes" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "inviteCode" TEXT NOT NULL,
  "enrollmentOpen" BOOLEAN NOT NULL DEFAULT true,
  "maximumStudents" INTEGER,
  "status" "AcademyClassStatus" NOT NULL DEFAULT 'UPCOMING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_class_memberships" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AcademyMembershipRole" NOT NULL,
  "status" "AcademyMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "lastActiveAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_class_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_course_modules" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_course_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_lessons" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "learningObjectives" JSONB,
  "lessonContent" TEXT,
  "estimatedMinutes" INTEGER,
  "orderIndex" INTEGER NOT NULL,
  "status" "AcademyLessonStatus" NOT NULL DEFAULT 'DRAFT',
  "lessonType" "AcademyLessonType" NOT NULL DEFAULT 'CLASSROOM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_assignments" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "lessonId" TEXT,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "instructions" TEXT,
  "deliverableType" "AcademyDeliverableType" NOT NULL,
  "dueAt" TIMESTAMP(3),
  "maximumScore" INTEGER NOT NULL DEFAULT 100,
  "rubric" JSONB,
  "allowResubmission" BOOLEAN NOT NULL DEFAULT true,
  "maximumAttempts" INTEGER,
  "requiredWorkspaceStage" TEXT,
  "status" "AcademyAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_submissions" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "projectId" TEXT,
  "submittedAssetId" TEXT,
  "submissionText" TEXT,
  "snapshot" JSONB,
  "status" "AcademySubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "score" DOUBLE PRECISION,
  "instructorSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_rubric_scores" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "maximumPoints" DOUBLE PRECISION NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_rubric_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_comments" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "targetType" "AcademyCommentTargetType" NOT NULL,
  "targetId" TEXT,
  "body" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_lesson_progress" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "status" "AcademyLessonProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastPosition" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_lesson_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academy_classes_inviteCode_key" ON "academy_classes"("inviteCode");
CREATE INDEX "academy_courses_ownerId_idx" ON "academy_courses"("ownerId");
CREATE INDEX "academy_courses_status_idx" ON "academy_courses"("status");
CREATE INDEX "academy_classes_courseId_idx" ON "academy_classes"("courseId");
CREATE INDEX "academy_classes_instructorId_idx" ON "academy_classes"("instructorId");
CREATE INDEX "academy_classes_status_idx" ON "academy_classes"("status");
CREATE INDEX "academy_classes_inviteCode_idx" ON "academy_classes"("inviteCode");
CREATE UNIQUE INDEX "academy_class_memberships_classId_userId_key" ON "academy_class_memberships"("classId", "userId");
CREATE INDEX "academy_class_memberships_classId_role_idx" ON "academy_class_memberships"("classId", "role");
CREATE INDEX "academy_class_memberships_userId_idx" ON "academy_class_memberships"("userId");
CREATE INDEX "academy_class_memberships_status_idx" ON "academy_class_memberships"("status");
CREATE INDEX "academy_course_modules_courseId_idx" ON "academy_course_modules"("courseId");
CREATE INDEX "academy_course_modules_courseId_orderIndex_idx" ON "academy_course_modules"("courseId", "orderIndex");
CREATE INDEX "academy_lessons_moduleId_idx" ON "academy_lessons"("moduleId");
CREATE INDEX "academy_lessons_moduleId_orderIndex_idx" ON "academy_lessons"("moduleId", "orderIndex");
CREATE INDEX "academy_lessons_status_idx" ON "academy_lessons"("status");
CREATE INDEX "academy_assignments_classId_idx" ON "academy_assignments"("classId");
CREATE INDEX "academy_assignments_lessonId_idx" ON "academy_assignments"("lessonId");
CREATE INDEX "academy_assignments_status_idx" ON "academy_assignments"("status");
CREATE INDEX "academy_assignments_dueAt_idx" ON "academy_assignments"("dueAt");
CREATE INDEX "academy_submissions_assignmentId_idx" ON "academy_submissions"("assignmentId");
CREATE INDEX "academy_submissions_studentId_idx" ON "academy_submissions"("studentId");
CREATE INDEX "academy_submissions_projectId_idx" ON "academy_submissions"("projectId");
CREATE INDEX "academy_submissions_status_idx" ON "academy_submissions"("status");
CREATE INDEX "academy_submissions_submittedAt_idx" ON "academy_submissions"("submittedAt");
CREATE UNIQUE INDEX "academy_rubric_scores_submissionId_criterionId_key" ON "academy_rubric_scores"("submissionId", "criterionId");
CREATE INDEX "academy_rubric_scores_submissionId_idx" ON "academy_rubric_scores"("submissionId");
CREATE INDEX "academy_comments_submissionId_idx" ON "academy_comments"("submissionId");
CREATE INDEX "academy_comments_authorId_idx" ON "academy_comments"("authorId");
CREATE INDEX "academy_comments_targetType_targetId_idx" ON "academy_comments"("targetType", "targetId");
CREATE INDEX "academy_comments_resolvedAt_idx" ON "academy_comments"("resolvedAt");
CREATE UNIQUE INDEX "academy_lesson_progress_lessonId_userId_classId_key" ON "academy_lesson_progress"("lessonId", "userId", "classId");
CREATE INDEX "academy_lesson_progress_lessonId_idx" ON "academy_lesson_progress"("lessonId");
CREATE INDEX "academy_lesson_progress_userId_idx" ON "academy_lesson_progress"("userId");
CREATE INDEX "academy_lesson_progress_classId_idx" ON "academy_lesson_progress"("classId");
CREATE INDEX "academy_lesson_progress_status_idx" ON "academy_lesson_progress"("status");

ALTER TABLE "academy_courses" ADD CONSTRAINT "academy_courses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_classes" ADD CONSTRAINT "academy_classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "academy_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_classes" ADD CONSTRAINT "academy_classes_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_class_memberships" ADD CONSTRAINT "academy_class_memberships_classId_fkey" FOREIGN KEY ("classId") REFERENCES "academy_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_class_memberships" ADD CONSTRAINT "academy_class_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_course_modules" ADD CONSTRAINT "academy_course_modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "academy_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_lessons" ADD CONSTRAINT "academy_lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "academy_course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_assignments" ADD CONSTRAINT "academy_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "academy_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_assignments" ADD CONSTRAINT "academy_assignments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "academy_submissions" ADD CONSTRAINT "academy_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "academy_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_submissions" ADD CONSTRAINT "academy_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_submissions" ADD CONSTRAINT "academy_submissions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "academy_rubric_scores" ADD CONSTRAINT "academy_rubric_scores_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "academy_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_comments" ADD CONSTRAINT "academy_comments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "academy_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_comments" ADD CONSTRAINT "academy_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_lesson_progress" ADD CONSTRAINT "academy_lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_lesson_progress" ADD CONSTRAINT "academy_lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_lesson_progress" ADD CONSTRAINT "academy_lesson_progress_classId_fkey" FOREIGN KEY ("classId") REFERENCES "academy_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
