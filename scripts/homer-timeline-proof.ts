/**
 * Homer decision-timeline proof — a re-runnable check of the memory, against the real database (2026-11-22).
 *
 * WHAT IT PROVES. Step 1 of Homer's memory had three write points, a reader and a derivation, and the only way to know they
 * agree with each other is to drive the loop the product will drive: propose → reject → propose → accept, then read the
 * events back and derive the creator's profile from them. It goes through `creativeHomerRouter` rather than calling the
 * timeline helpers directly, so the code under test is the code that ships; a broken wiring fails here, not in a fixture.
 *
 * WHAT IT WRITES. Four rows in `homer_decision_events` and, unless a project is supplied, one `creativeProject` (with its
 * brief and bible, created through `projectService.createFromIntent`). It is therefore GATED: without `--confirm` it prints
 * what it would do and exits 0. Use a test account, and pass an existing project id to avoid creating another.
 *
 * THE FIRST RUN. Project `cmwroldu8000031yvfw6re1uz` (owner `cmuyyc3z00000vh7ihl8ep128`) produced exactly what the plan
 * asked for — four rows, two outcomes, two `supersedes` links — and the derivation returned
 * `empty=false, evidenceCount=2, REVEAL accepted=1 rejected=1 lean=0.00`. It also exposed a real defect the tests missed:
 * `pickProposal` never consults rejections, so the second proposal repeated the value the creator had just rejected. The
 * output below prints both proposals' values for exactly that reason.
 *
 * USAGE
 *   pnpm homer:proof <userId> [projectId] --confirm
 *
 * Needs the same env as the worker (`DATABASE_URL`, plus the Redis vars for the rate limiter — on the VPS they live in
 * `apps/web/.env.local`, which is a separate file from the root `.env`).
 */
import { prisma } from '../packages/database';
import { projectService } from '../packages/api/src/lib/creative/project/service';
import { creativeHomerRouter } from '../packages/api/src/routers/creative/homer';
import { deriveCreatorProfile } from '../packages/api/src/lib/homer/profile';

const CONFIRMED = process.argv.includes('--confirm');
const positionals = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const USER_ID = positionals[0];
const EXISTING_PROJECT_ID = positionals[1];

if (!USER_ID) {
  console.error('usage: pnpm homer:proof <userId> [projectId] --confirm');
  process.exit(2);
}

if (!CONFIRMED) {
  console.log('DRY RUN — nothing written.');
  console.log(`  would create ${EXISTING_PROJECT_ID ? `no project (using ${EXISTING_PROJECT_ID})` : 'one project'} for user ${USER_ID}`);
  console.log('  would append 4 rows to homer_decision_events: PROPOSED, REJECTED, PROPOSED, ACCEPTED');
  console.log('  would derive the profile from those rows and print it');
  console.log('Re-run with --confirm to do it.');
  process.exit(0);
}

(async () => {
  const project = EXISTING_PROJECT_ID
    ? { id: EXISTING_PROJECT_ID }
    : await projectService.createFromIntent(prisma as never, {
        userId: USER_ID,
        text: 'A lighthouse keeper finds a bird that will not leave, and the storm decides the rest.',
      });
  console.log(`PROJECT=${project.id}`);

  const caller = creativeHomerRouter.createCaller({
    prisma,
    user: { id: USER_ID, role: 'CREATOR' },
    isR16: false,
    ip: '127.0.0.1',
  } as never);
  const storyState = {
    version: 'homer_v1',
    genre: { value: 'drama' },
    storyText: 'A keeper and a bird.',
  } as unknown as Record<string, unknown>;

  // 1 — Homer proposes; the creator declines.
  const first = await caller.proposeDecision({ projectId: project.id, storyState, category: 'VISUAL_TREATMENT', existingDecisions: [] });
  console.log(`PROPOSAL_1=${first.proposalEventId} value=${first.decision.value}`);
  await caller.rejectDecision({
    projectId: project.id,
    category: 'VISUAL_TREATMENT',
    label: first.decision.label,
    value: first.decision.value,
    rationale: 'Too stylised for this one.',
    proposalEventId: first.proposalEventId,
  });

  // 2 — Homer proposes again; this time it is accepted.
  const second = await caller.proposeDecision({
    projectId: project.id,
    storyState,
    category: 'VISUAL_TREATMENT',
    existingDecisions: [first.decision as never],
  });
  console.log(`PROPOSAL_2=${second.proposalEventId} value=${second.decision.value}`);
  if (second.decision.value === first.decision.value) {
    // Not a failure of this harness: it is the known gap. Printed so a rerun cannot quietly hide it.
    console.log('NOTE: the second proposal repeats the rejected value — pickProposal does not consult rejections yet.');
  }
  await caller.approveAndSave({
    projectId: project.id,
    storyState,
    decisions: [{
      category: 'VISUAL_TREATMENT',
      label: second.decision.label,
      value: second.decision.value,
      rationale: second.decision.rationale,
      proposalEventId: second.proposalEventId,
    }],
  });

  // Read through the same reader the UI uses (rather than the generated client directly), so a break in the reader fails
  // this proof too. `loadDecisionTimeline` returns every outcome, newest first, with `replacedBy` resolved.
  const timeline = await caller.decisionTimeline({ projectId: project.id });
  console.log('--- timeline (newest first) ---');
  for (const event of timeline.events) {
    console.log(
      `${event.outcome.padEnd(9)} ${event.provenance.padEnd(14)} value=${event.value.padEnd(24)} ` +
        `supersedes=${event.supersedes ?? '-'} replacedBy=${event.replacedBy ?? '-'}`,
    );
  }

  const rows = timeline.events;
  console.log(
    `ROWS=${rows.length} OUTCOMES=${[...new Set(rows.map((row) => row.outcome))].join(',')} ` +
      `SUPERSEDES=${rows.filter((row) => row.supersedes).length}`,
  );

  const profile = deriveCreatorProfile(rows);
  console.log('--- profile derived from those rows ---');
  console.log(`empty=${profile.empty} evidenceCount=${profile.evidenceCount}`);
  for (const axis of profile.axes) {
    console.log(
      `${axis.axis.padEnd(11)} accepted=${axis.accepted} rejected=${axis.rejected} ` +
        `lean=${axis.lean.toFixed(2)}  "${axis.because}"`,
    );
  }

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(`PROOF_FAILED=${String((error as Error)?.message ?? error).slice(0, 400)}`);
  await prisma.$disconnect();
  process.exit(1);
});
