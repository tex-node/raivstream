/**
 * Phase 4b — share destinations. Instagram exposes no direct-share URL scheme, so
 * it is copy-link only; WhatsApp has a real share URL; native share is offered only
 * when the browser supports it.
 */
export type ShareTargetId = 'whatsapp' | 'instagram' | 'copy' | 'native';

export interface ShareTarget {
  id: ShareTargetId;
  label: string;
  /** true = we can open a share URL/API; false = copy-link only. */
  direct: boolean;
}

export function shareTargets(opts: { canNativeShare: boolean }): ShareTarget[] {
  const targets: ShareTarget[] = [
    { id: 'whatsapp', label: 'WhatsApp', direct: true },
    { id: 'instagram', label: 'Instagram', direct: false }, // copy-link only
    { id: 'copy', label: 'Copy link', direct: true },
  ];
  if (opts.canNativeShare) targets.push({ id: 'native', label: 'Share…', direct: true });
  return targets;
}

/** WhatsApp share URL for a link (text prefilled with the URL). */
export function whatsappShareUrl(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}
