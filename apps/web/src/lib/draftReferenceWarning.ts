/**
 * R16-03 follow-up — whether to surface the "draft references" warning after a
 * scene-generation result. R16 hides it entirely (creator-facing affordance only);
 * a dismissed banner stays hidden for the session.
 */
export function shouldShowDraftReferenceWarning(input: {
  hasDraftReferences?: boolean | null;
  isR16: boolean;
  dismissed: boolean;
}): boolean {
  return Boolean(input.hasDraftReferences) && !input.isR16 && !input.dismissed;
}
