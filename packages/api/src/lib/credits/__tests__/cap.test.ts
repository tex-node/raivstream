import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreditCapExceededError, assertWithinCeiling, capStopReason, finalRunStatus, loadRunBudget } from '../cap';

/**
 * The per-run credit ceiling (Phase 7).
 *
 * A cap is not a rate. `generate:flux2` costing 80 is a per-asset RATE; "this run may spend at most
 * N" is a RUN limit, counted across every asset the run charges and persisted on the run row so a
 * resumed attempt remembers its budget instead of starting from zero.
 *
 * The check runs BEFORE the charge - a cap that fires afterwards has already spent the money it was
 * meant to withhold.
 */

describe('the ceiling refuses the asset that would cross it', () => {
  it('allows a charge that stays within the ceiling', () => {
    expect(() => assertWithinCeiling({ runId: 'run_1', ceiling: 200, spent: 80, nextCost: 80 })).not.toThrow();
  });

  it('allows a charge that lands exactly on the ceiling', () => {
    expect(() => assertWithinCeiling({ runId: 'run_1', ceiling: 160, spent: 80, nextCost: 80 })).not.toThrow();
  });

  it('refuses the charge that would exceed it, and names the ceiling and the spend', () => {
    let error: unknown;
    try {
      assertWithinCeiling({ runId: 'run_1', ceiling: 160, spent: 160, nextCost: 80 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CreditCapExceededError);
    const typed = error as CreditCapExceededError;
    expect(typed.ceiling).toBe(160);
    expect(typed.spent).toBe(160);
    expect(typed.nextCost).toBe(80);
    expect(typed.message).toContain('ceiling of 160');
  });

  it('a partially-completed run is not aborted for having spent - only the next charge is refused', () => {
    // 80 already spent under a 160 ceiling: the run keeps its 80 and may spend one more.
    expect(() => assertWithinCeiling({ runId: 'run_1', ceiling: 160, spent: 80, nextCost: 80 })).not.toThrow();
  });

  it('a null ceiling is uncapped', () => {
    expect(() => assertWithinCeiling({ runId: 'run_1', ceiling: null, spent: 100000, nextCost: 80 })).not.toThrow();
  });
});

describe('the budget is read from the run row, so a resume remembers it', () => {
  function fakePrisma(row: { creditCeiling: number | null; creditsSpent: number } | null) {
    return { creativeProductionRun: { findUnique: async () => row } } as never;
  }

  it('a resumed run inherits the ceiling and the spend of the previous attempt', async () => {
    const budget = await loadRunBudget(fakePrisma({ creditCeiling: 160, creditsSpent: 80 }), 'run_1');
    expect(budget).toEqual({ ceiling: 160, spent: 80 });
    // the next 80 fits; a second one would not
    expect(() => assertWithinCeiling({ runId: 'run_1', ...budget, nextCost: 80 })).not.toThrow();
    expect(() => assertWithinCeiling({ runId: 'run_1', ceiling: budget.ceiling, spent: 160, nextCost: 80 })).toThrow(
      CreditCapExceededError,
    );
  });

  it('a run with no row is uncapped rather than silently capped at zero', async () => {
    expect(await loadRunBudget(fakePrisma(null), 'run_missing')).toEqual({ ceiling: null, spent: 0 });
    expect(await loadRunBudget(fakePrisma(null), null)).toEqual({ ceiling: null, spent: 0 });
  });
});

describe('the runner checks the cap before charging and persists the spend after', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'creative', 'production', 'runner.ts'), 'utf8');

  it('asserts the ceiling before the charge call', () => {
    const guard = source.indexOf('assertWithinCeiling({ runId, ceiling: budget.ceiling');
    const charge = source.indexOf('await chargeOrThrow(');
    expect(guard).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(charge);
  });

  it('persists creditsSpent so a resume does not reset the budget', () => {
    expect(source).toContain('creditsSpent: budget.spent');
  });
});

describe('a capped run reports PARTIAL, and says why', () => {
  it('a capped run is never COMPLETED, even when assets were produced', () => {
    expect(finalRunStatus({ capHit: true, generated: 7, failed: 1 })).toBe('PARTIAL');
  });

  it('a run that finished under its ceiling is still COMPLETED - the fix does not make everything partial', () => {
    expect(finalRunStatus({ capHit: false, generated: 8, failed: 0 })).toBe('COMPLETED');
  });

  it('a run that produced nothing and failed is FAILED, not PARTIAL', () => {
    expect(finalRunStatus({ capHit: false, generated: 0, failed: 4 })).toBe('FAILED');
  });

  it('the stop reason is machine-readable: ceiling, spend, and where it stopped', () => {
    const reason = capStopReason({ ceiling: 1680, spent: 920, assetIndex: 4, totalAssets: 8 });
    expect(reason).toBe('CREDIT_CAP_EXCEEDED ceiling=1680 spent=920 stoppedAt=4/8');
    // a caller can branch on it without parsing prose
    expect(reason.startsWith('CREDIT_CAP_EXCEEDED ')).toBe(true);
    expect(reason).toContain('ceiling=1680');
    expect(reason).toContain('stoppedAt=4/8');
  });
});

describe('the runner reports the cap instead of swallowing it', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'creative', 'production', 'runner.ts'), 'utf8');

  it('the final status comes from finalRunStatus, not an inline ternary', () => {
    expect(source).toContain('finalRunStatus({ capHit: Boolean(capHit), generated, failed })');
  });

  it('the cap error is detected and stops the loop', () => {
    expect(source).toContain('error instanceof CreditCapExceededError');
    expect(source).toContain('capHit = { ceiling: capped.ceiling, spent: capped.spent, assetIndex: specs.indexOf(spec) + 1 };');
  });

  it('the run row records the stop reason', () => {
    expect(source).toContain('lastError: stopReason');
  });
});
