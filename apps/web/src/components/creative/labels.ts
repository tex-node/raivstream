/** Creator-facing labels for internal enum values. */

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  STORY: 'Story',
  EDUCATION: 'Education',
  COMMERCIAL: 'Commercial',
  TRANSFORMATION: 'Transformation',
  UNKNOWN: 'Film',
};

export const STATUS_LABEL: Record<string, string> = {
  IDEA: 'Draft',
  INTERPRETING: 'Interpreting',
  PLANNING: 'Planning',
  PREVIEW: 'Ready to preview',
  DIRECTING: 'In review',
  GENERATING: 'Creating',
  REVIEW: 'In review',
  REFINING: 'Refining',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

const DIRECTOR_FIELD_LABEL: Record<string, string> = {
  creativeDirection: 'Visual direction',
  visualLanguage: 'Visual style',
  'state.emotionalExpression': 'Emotional tone',
  'pacing.opening': 'Opening pacing',
  lighting: 'Lighting',
  wardrobe: 'Wardrobe',
  ending: 'Ending',
  audience: 'Audience',
  safety: 'Content tone',
  scene: 'Scene',
  worldDetail: 'World detail',
};

export function directorFieldLabel(field: string): string {
  if (DIRECTOR_FIELD_LABEL[field]) return DIRECTOR_FIELD_LABEL[field];
  const last = field.split('.').pop() ?? field;
  return last.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

export function bibleContentString(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const names = content
      .map((item) =>
        typeof item === 'object' && item !== null
          ? ((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).title)
          : null,
      )
      .filter((n): n is string => typeof n === 'string');
    return names.length > 0 ? names.join(', ') : null;
  }
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    for (const key of ['premise', 'style', 'description', 'name', 'summary']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).length > 0) return obj[key] as string;
    }
  }
  return null;
}
