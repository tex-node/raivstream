/**
 * Which engine wrote this chapter (2026-11-11).
 *
 * The record already existed: `StoryChapter.providerMetadata` is written by both chapter paths with
 * `provider: 'claude-narrative' | 'openai-compatible' | 'local-fallback'` and the model. Its only
 * reader was `/admin/prompt-quality` — an admin could see which engine wrote a story and its creator
 * could not. That is a record with one reader, and not the person it is about.
 *
 * Two rules this maps to:
 *  - **every provider says something different**, including the deterministic fallback. A creator
 *    whose story came from the built-in writer is being shown a different product than one whose
 *    story came from Claude; hiding that is the same defect as hiding the engine entirely.
 *  - **a missing or unknown record renders nothing.** Absence is not evidence of a particular engine,
 *    and a guess here would be a fabricated provenance.
 */
export function engineLabel(metadata: unknown): string | null {
  const record = (metadata ?? null) as { provider?: unknown; model?: unknown } | null;
  const provider = typeof record?.provider === 'string' ? record.provider : null;
  if (!provider) return null;
  const model = typeof record?.model === 'string' && record.model.length > 0 ? record.model : null;

  switch (provider) {
    case 'claude-narrative':
      return model ? `Written with Claude (${model})` : 'Written with Claude';
    case 'openai-compatible':
      return model ? `Written with an external language model (${model})` : 'Written with an external language model';
    case 'local-fallback':
      // Named plainly, not hidden behind a friendly euphemism: this is the built-in writer, no model.
      return 'Written with the built-in story writer — no language model was used';
    default:
      return null;
  }
}
