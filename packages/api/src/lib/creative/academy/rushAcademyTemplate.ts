/**
 * Phase 9 - Academy content tied to controls that exist (2026-11-08).
 *
 * Twelve lessons in four modules. Every lesson names a control that shipped and was proven on real
 * input (Phases 4, 5, 7) and carries the marker a reachability test looks for. The rule the content
 * holds: a lesson must not promise what the code cannot deliver - the same burden of proof a log
 * line carries.
 *
 * Deliberately absent: the identity store (3 of 7 measured beats clear the floor, externally blocked
 * on thin-intent input), LoRAs, and the motion/object operator (provider capability that does not
 * exist).
 */

export interface LessonControl {
  id: string;
  label: string;
  reachableAt: string;
  marker: string;
  markerFile: string;
}

export interface RushLesson {
  title: string;
  summary: string;
  learningObjectives: string[];
  lessonContent: string;
  estimatedMinutes: number;
  lessonType: 'CLASSROOM' | 'WORKSPACE' | 'LAB';
  control: LessonControl;
}

export interface RushModule {
  title: string;
  description: string;
  lessons: RushLesson[];
}

const autoMode: LessonControl = {
  id: 'auto-mode',
  label: 'Auto mode: one sentence to a finished film',
  reachableAt: 'creative.project.auto (tRPC)',
  marker: 'auto: creativeProcedure',
  markerFile: 'packages/api/src/routers/creative/project.ts',
};

const creditCap: LessonControl = {
  id: 'credit-cap',
  label: 'The per-run credit ceiling',
  reachableAt: 'creative.project.auto with a ceiling; enforced in the production runner',
  marker: 'assertWithinCeiling',
  markerFile: 'packages/api/src/lib/credits/cap.ts',
};

const preflight: LessonControl = {
  id: 'preflight',
  label: 'Pre-flight moderation: a refusal costs nothing',
  reachableAt: 'automatic before every charge in the production runner',
  marker: 'preflightDecision',
  markerFile: 'packages/api/src/lib/creative/production/preflight.ts',
};

const perShot: LessonControl = {
  id: 'per-shot',
  label: 'Per-shot production (opt-in)',
  reachableAt: 'runCreativeProduction({ perShot: true })',
  marker: 'perShot',
  markerFile: 'packages/api/src/lib/creative/production/capabilityRouter.ts',
};

const takeModel: LessonControl = {
  id: 'take-model',
  label: 'Regenerating a take without losing the last one',
  reachableAt: 'createNewTake in production, surfaced as a new take in the workspace',
  marker: 'createNewTake',
  markerFile: 'packages/api/src/lib/creative/production/newTake.ts',
};

const looks: LessonControl = {
  id: 'cinematic-look',
  label: 'Saving, applying and sharing a cinematic look',
  reachableAt: 'creative look service; applied with runCreativeProduction({ lookName })',
  marker: 'saveLook',
  markerFile: 'packages/api/src/lib/creative/look/service.ts',
};

const critic: LessonControl = {
  id: 'critic',
  label: 'What the critic scores and what the numbers mean',
  reachableAt: 'creative.review (tRPC) and creative_review_runs.scores',
  marker: 'evaluateWithCritic',
  markerFile: 'packages/api/src/lib/creative/review/criticAdapter.ts',
};

const finishing: LessonControl = {
  id: 'finishing',
  label: 'Finishing: assembly and export',
  reachableAt: 'creative.output (tRPC), auto-assembled after a completed run',
  marker: 'autoAssemble',
  markerFile: 'packages/api/src/lib/creative/output/service.ts',
};

export const RUSH_CONTROLS_COURSE_TEMPLATE = {
  title: 'Rush: the controls that exist',
  description:
    'A short course in the Raivstream creative surface as it actually behaves today - what the controls do, what they cost, and where they fall short.',
  learningOutcome:
    'Each student produces a short film from one sentence, regenerates a single shot, saves and applies a look, and finishes a run inside a credit ceiling.',
  audienceDescription: 'Creators who want a finished film, and teams evaluating the surface.',
  durationWeeks: 4,
  sessionsPerWeek: 3,
  sessionDurationMinutes: 30,
  modules: [
    {
      title: 'Module 1 - Getting started',
      description: 'The one-sentence film, what auto mode decides, and how to read what comes back.',
      lessons: [
        {
          title: 'Lesson 1: One sentence, one film',
          summary: 'Run auto mode on a single sentence and see what it decides for you.',
          learningObjectives: [
            'Write a one-sentence premise with a character and an action',
            'Run auto mode and read the decisions it made on your behalf',
          ],
          lessonContent:
            'Auto mode takes your sentence, interprets it, decides every question it is allowed to decide, builds a plan, and produces the film. It refuses rather than inventing an answer when a question is not deferrable, and tells you which question stopped it.',
          estimatedMinutes: 30,
          lessonType: 'WORKSPACE',
          control: autoMode,
        },
        {
          title: 'Lesson 2: What auto mode decided, and why',
          summary: 'Read the decision list instead of accepting it blindly.',
          learningObjectives: ['Find the auto-resolved decisions', 'Explain why a decision was defaulted rather than guessed'],
          lessonContent:
            'Every auto-resolved question comes back with the choice it made and whether it came from your words or from a default. A story that happens to mention teaching is still a story - the classifier reads form, not vocabulary.',
          estimatedMinutes: 30,
          lessonType: 'CLASSROOM',
          control: autoMode,
        },
        {
          title: 'Lesson 3: Reading the result',
          summary: 'Tell a finished film from a partial one by the record, not the wording.',
          learningObjectives: ['Read the run status and stop reason', 'Distinguish PARTIAL from COMPLETED'],
          lessonContent:
            'A run carries its status, its net spend and, when it stopped short, a machine-readable reason. A capped run reports PARTIAL; a dropped scene is recorded with its kind. Nothing about a film should have to be inferred from a progress bar.',
          estimatedMinutes: 30,
          lessonType: 'CLASSROOM',
          control: creditCap,
        },
      ],
    },
    {
      title: 'Module 2 - Directing',
      description: 'Per-shot production, regenerating a take, and what the critic measures.',
      lessons: [
        {
          title: 'Lesson 4: One scene, several shots',
          summary: 'What per-shot production buys, and what it costs.',
          learningObjectives: ['Explain the multiplier', 'Decide when shot-level work is worth it'],
          lessonContent:
            'Per-shot production emits one still per shot instead of one per scene. Every scene template carries three shot ideas, so it triples the stills - opt-in, never the default, because tripling a production cost is a decision rather than a detail.',
          estimatedMinutes: 30,
          lessonType: 'CLASSROOM',
          control: perShot,
        },
        {
          title: 'Lesson 5: Regenerating one take',
          summary: 'Redo a shot without touching the shots around it.',
          learningObjectives: ['Regenerate a single shot', 'Confirm the neighbouring take is untouched'],
          lessonContent:
            'A new take is a new row, never a reset: the previous take is kept and demoted, the new one becomes latest, and the other shots in the scene keep theirs. Resetting a row would replay the charge and record nothing.',
          estimatedMinutes: 30,
          lessonType: 'WORKSPACE',
          control: takeModel,
        },
        {
          title: 'Lesson 6: What the critic scores',
          summary: 'Read identity and composition as separate measurements.',
          learningObjectives: ['Read the score dimensions', 'Use a low score as a decision, not a verdict'],
          lessonContent:
            'The critic scores identity and composition separately and records them on the review run. A score is evidence about one image, not a statement about your story - read it next to the still.',
          estimatedMinutes: 30,
          lessonType: 'CLASSROOM',
          control: critic,
        },
      ],
    },
    {
      title: 'Module 3 - Look and feel',
      description: 'Saving a look, applying it, sharing it - and the measured finding that a look can lower the score.',
      lessons: [
        {
          title: 'Lesson 7: Saving a look',
          summary: 'Turn lens, movement, lighting and grade into a named object.',
          learningObjectives: ['Save a look under a name', 'Re-read it and confirm it survived'],
          lessonContent:
            'A look is a first-class object rather than a prompt fragment: lens, movement, lighting, grade and resolution, saved under a name inside a project. Values outside the ladder fall back to the default rather than being written through.',
          estimatedMinutes: 30,
          lessonType: 'WORKSPACE',
          control: looks,
        },
        {
          title: 'Lesson 8: Applying a look',
          summary: 'Apply a saved look to a production without re-entering a field.',
          learningObjectives: ['Apply a look by name', 'Confirm the fragment reached the prompt'],
          lessonContent:
            'A production asks for a look by name; the fragment is composed onto every still prompt before identity framing, so the look describes the image while framing still governs how the character is held.',
          estimatedMinutes: 30,
          lessonType: 'WORKSPACE',
          control: looks,
        },
        {
          title: 'Lesson 9: A look can lower your score',
          summary: 'The measured finding, taught honestly.',
          learningObjectives: ['Compare a scene with and without a look', 'Decide from the measurement, not the label'],
          lessonContent:
            'Measured on a real scene: 80 / 85 / 85 without a look, and 70 / 75 / 75 with a long-lens low-key monochrome look. A look is a choice with consequences, not an upgrade - measure it on your own scene before committing a film to it.',
          estimatedMinutes: 30,
          lessonType: 'LAB',
          control: looks,
        },
      ],
    },
    {
      title: 'Module 4 - Finishing',
      description: 'The credit ceiling, moderation before the charge, and finishing a run.',
      lessons: [
        {
          title: 'Lesson 10: The credit ceiling',
          summary: 'Set a ceiling and see the run stop before it spends past it.',
          learningObjectives: ['Set a per-run ceiling', 'Read a refusal and its numbers'],
          lessonContent:
            'The ceiling is persisted on the run and checked before each charge, so a refused charge never happens. A partially-completed run is not aborted for having spent - the cap withholds the next charge, and the run reports PARTIAL with the spend it reached.',
          estimatedMinutes: 30,
          lessonType: 'LAB',
          control: creditCap,
        },
        {
          title: 'Lesson 11: Moderation before the charge',
          summary: 'Why a refusal is free, and what a softened prompt looks like.',
          learningObjectives: ['Explain why moderation runs before the charge', 'Recognise a softened prompt'],
          lessonContent:
            'Moderation is free and generation is not, so the composed prompt is checked first. A rejected prompt gets one softening attempt and is re-checked; if it still fails, the asset is refused for nothing. Four runs once paid to discover refusals a pre-flight now catches for free.',
          estimatedMinutes: 30,
          lessonType: 'CLASSROOM',
          control: preflight,
        },
        {
          title: 'Lesson 12: Finishing and publishing',
          summary: 'Assemble the film and put it where people can watch it.',
          learningObjectives: ['Assemble a finished run', 'Publish from the review state'],
          lessonContent:
            'A completed run lands the film in review, where you approve it and export. The assembly is automatic; what remains is your judgement about whether the film is worth putting in front of an audience.',
          estimatedMinutes: 30,
          lessonType: 'LAB',
          control: finishing,
        },
      ],
    },
  ] as RushModule[],
};

export const RUSH_LESSONS: RushLesson[] = RUSH_CONTROLS_COURSE_TEMPLATE.modules.flatMap((module) => module.lessons);
