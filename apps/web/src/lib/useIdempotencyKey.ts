'use client';

import { useRef } from 'react';
import { resolveIdempotencyId, type IdempotencyStore } from './idempotencyFor';

/**
 * Returns `(inputs) => id`: a stable idempotency id for the given mutation
 * inputs. The id is regenerated only when the inputs change; unchanged inputs
 * reuse it, so a double-click or network retry dedupes while a legitimate edit
 * still charges.
 *
 * Call it at fire time (inside the payload builder) — never on mount or on
 * every keystroke.
 */
export function useIdempotencyKey(): (inputs: unknown) => string {
  const store = useRef<IdempotencyStore | null>(null);
  return (inputs: unknown): string => {
    const next = resolveIdempotencyId(store.current, inputs);
    store.current = next.store;
    return next.id;
  };
}
