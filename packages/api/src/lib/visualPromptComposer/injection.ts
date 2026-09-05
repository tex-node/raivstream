// Prompt injection defense.
// Story/user-supplied text is DATA. It must not be able to alter composer behavior,
// reveal system internals, or override safety rules.
//
// Strategy: sanitize text by removing instruction-shaped patterns before embedding
// in the prompt. The structured payload format (field: value) means user text never
// reaches a system-instruction position. This is defense-in-depth.

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /print\s+(your\s+)?(system\s+)?prompt/i,
  /show\s+(me\s+)?(your\s+)?(system\s+)?prompt/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(a|an)\s+/i,
  /override\s+(safety|rules|guidelines|instructions)/i,
  /remove\s+(safety|content\s+filter|restrictions)/i,
  /disable\s+(safety|content\s+filter|restrictions)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

export function sanitizeStoryContent(text: string): string {
  let result = text;
  for (const pattern of INJECTION_PATTERNS) {
    // Replace the pattern with a harmless placeholder
    result = result.replace(pattern, '[story content]');
  }
  return result;
}

export function sanitizeCharacterName(name: string): string {
  // Strip any instruction-like patterns from character names
  return sanitizeStoryContent(name).slice(0, 80).trim() || 'Character';
}

export function sanitizeActionText(action: string): string {
  return sanitizeStoryContent(action).slice(0, 400).trim();
}

export function sanitizeEnvironmentText(env: string): string {
  return sanitizeStoryContent(env).slice(0, 200).trim();
}

// Test whether a string contains attempted injection (for logging/analytics)
export function containsInjectionAttempt(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
