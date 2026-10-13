'use client';

import { useMemo, useRef } from 'react';
import { resolveIdempotencyId, type IdempotencyStore } from './idempotencyFor';

export type IdempotencyKeyFn = ((inputs: unknown) => string) & {
  /**
   * Forget the stored id + hash so the NEXT call mints a fresh id.
   *
   * Retry after FAILURE must be a new logical request (so it legitimately
   * charges); a duplicate click on SUCCESS must dedupe. So call `rotate()` from a
   * mutation's `onError` — never from `onSuccess`.
   */
  rotate(): void;
};

/**
 * Returns `(inputs) => id`: a stable idempotency id for the given mutation
 * inputs. The id is regenerated only when the inputs change; unchanged inputs
 * reuse it, so a double-click or network retry dedupes while a legitimate edit
 * still charges. The returned function also exposes `rotate()` to force the next
 * call to mint a fresh id (used after a failed mutation; see above).
 *
 * Call it at fire time (inside the payload builder) — never on mount or on
 * every keystroke.
 */
export function useIdempotencyKey(): IdempotencyKeyFn {
  const store = useRef<IdempotencyStore | null>(null);
  return useMemo(() => {
    const fn = ((inputs: unknown): string => {
      const next = resolveIdempotencyId(store.current, inputs);
      store.current = next.store;
      return next.id;
    }) as IdempotencyKeyFn;
    fn.rotate = (): void => {
      store.current = null;
    };
    return fn;
  }, []);
}
