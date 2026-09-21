import { describe, it, expect } from 'vitest';
import { normaliseStatus, normaliseRunpodError } from '../runpod';
import { generationError, providerFailure, resultInvalid, storageFailed } from '../jobModel';

describe('unified generation-job state machine', () => {
  it('normalises RunPod statuses into the canonical state, preserving cancelled', () => {
    expect(normaliseStatus('IN_QUEUE')).toBe('queued');
    expect(normaliseStatus('IN_PROGRESS')).toBe('generating');
    expect(normaliseStatus('COMPLETED')).toBe('completed');
    expect(normaliseStatus('CANCELLED')).toBe('cancelled');
    expect(normaliseStatus('FAILED')).toBe('failed');
    expect(normaliseStatus('TIMED_OUT')).toBe('failed');
  });

  it('classifies RunPod errors distinctly (timeout vs cancelled vs provider)', () => {
    expect(normaliseRunpodError('TIMED_OUT')).toMatchObject({ code: 'TIMEOUT', retryable: true });
    expect(normaliseRunpodError('CANCELLED')).toMatchObject({ code: 'CANCELLED', retryable: false });
    expect(normaliseRunpodError('FAILED', 'boom')).toMatchObject({ code: 'PROVIDER_ERROR', retryable: false });
    expect(normaliseRunpodError('COMPLETED')).toBeUndefined();
  });

  it('builds normalized errors with stable codes', () => {
    expect(resultInvalid()).toMatchObject({ code: 'RESULT_INVALID', retryable: false });
    expect(storageFailed()).toMatchObject({ code: 'STORAGE_FAILED', retryable: true });
    expect(providerFailure('x')).toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(generationError('TIMEOUT', 't', true)).toMatchObject({ code: 'TIMEOUT', retryable: true });
  });
});
