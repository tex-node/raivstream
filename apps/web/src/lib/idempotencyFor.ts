/**
 * Client-side idempotency helpers (Phase 1).
 *
 * `stableHash` deterministically hashes a JSON-serialisable value with sorted
 * keys, so two structurally-identical mutation inputs hash the same regardless
 * of key order. `resolveIdempotencyId` couples an id to the current inputs:
 * unchanged inputs reuse the id (double-click / network retry dedupe); edited
 * inputs get a fresh id (a legitimate change still charges).
 */

/** FNV-1a 32-bit, hex. */
function fnv1a(str: string, seed = 0x811c9dc5): string {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON.stringify with recursively sorted object keys. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 12-hex-char deterministic hash of the value's sorted-key JSON. */
export function stableHash(inputs: unknown): string {
  const s = stableStringify(inputs);
  return fnv1a(s) + fnv1a(s, 0x9e3779b1).slice(0, 4);
}

export interface IdempotencyStore {
  id: string;
  hash: string;
}

/**
 * Pure core of `useIdempotencyKey`. Given the current `store` and the mutation
 * inputs, returns the id to use and the next store. Only the LATEST hash is
 * remembered, so reverting inputs to a prior state yields a NEW id (an
 * intervening change invalidates the old one).
 */
export function resolveIdempotencyId(
  store: IdempotencyStore | null,
  inputs: unknown,
  makeId: () => string = () => crypto.randomUUID(),
): { id: string; store: IdempotencyStore } {
  const hash = stableHash(inputs);
  if (store && store.hash === hash) return { id: store.id, store };
  const id = makeId();
  return { id, store: { id, hash } };
}
