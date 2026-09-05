// Prompt budgeting — deterministic priority-based text fitting.
//
// Priority order (highest first):
// 1. Character identity (never truncated)
// 2. Required scene action
// 3. Critical environment
// 4. Spatial relationships
// 5. Continuity rules
// 6. Camera / composition
// 7. Lighting / style
// 8. Optional decoration (mood, weather, color intent)

export type PromptSection = {
  priority: number;   // 1 = highest (never drop), higher = more expendable
  label: string;
  text: string;
  required?: boolean; // if true, section is never dropped regardless of budget
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function charCount(text: string): number {
  return text.length;
}

// Build a prompt from sections within a character budget.
// Sections are joined by ". " — sections beyond budget are dropped,
// starting from the lowest priority (highest priority number).
export function buildBudgetedPrompt(sections: PromptSection[], maxLength: number): string {
  // Sort by priority ascending (required sections go first regardless)
  const sorted = [...sections].sort((a, b) => {
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    return a.priority - b.priority;
  });

  const included: string[] = [];
  let length = 0;
  const joinLen = 2; // ". " between parts

  for (const section of sorted) {
    const text = section.text.trim();
    if (!text) continue;
    const addLen = included.length === 0 ? text.length : joinLen + text.length;
    if (!section.required && length + addLen > maxLength) {
      // Try to skip this section
      continue;
    }
    included.push(text);
    length += addLen;
  }

  let result = included.join('. ');
  // Final hard truncation at word boundary if still over (shouldn't happen with required sections)
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
    const boundary = Math.max(
      result.lastIndexOf('. '),
      result.lastIndexOf(', '),
      result.lastIndexOf(' '),
    );
    if (boundary > maxLength * 0.7) result = result.slice(0, boundary);
  }
  return result.trim();
}

// Build negative prompt within budget, deduplicating and preserving required terms first
export function buildBudgetedNegativePrompt(parts: string[], maxLength: number): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(part.trim());
  }
  const joined = unique.join(', ');
  if (joined.length <= maxLength) return joined;
  // Truncate at comma boundary
  const clipped = joined.slice(0, maxLength);
  const lastComma = clipped.lastIndexOf(', ');
  return lastComma > maxLength * 0.5 ? clipped.slice(0, lastComma) : clipped;
}

// Measure similarity between two prompts (detect suspiciously repetitive adjacent scenes)
export function promptSimilarityRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// Returns true if two adjacent scene prompts are suspiciously similar (>80% overlap)
export function isProblematicallySimilar(promptA: string, promptB: string): boolean {
  return promptSimilarityRatio(promptA, promptB) > 0.8;
}
