import { describe, expect, it } from 'vitest';
import { shareTargets, whatsappShareUrl } from '../shareTargets';

describe('whatsappShareUrl', () => {
  it('produces a wa.me URL with the share link URL-encoded', () => {
    const url = whatsappShareUrl('https://r16.raivstream.com/s/abc123');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent('https://r16.raivstream.com/s/abc123')}`);
    expect(url).toContain('%3A%2F%2F'); // the scheme/authority is encoded
  });
});

describe('shareTargets', () => {
  it('marks Instagram as copy-link only (no direct share URL scheme)', () => {
    const instagram = shareTargets({ canNativeShare: false }).find((t) => t.id === 'instagram');
    expect(instagram).toBeDefined();
    expect(instagram!.direct).toBe(false);
  });

  it('offers WhatsApp + Copy link as direct actions, and native only when available', () => {
    expect(shareTargets({ canNativeShare: false }).map((t) => t.id)).toEqual(['whatsapp', 'instagram', 'copy']);
    expect(shareTargets({ canNativeShare: true }).map((t) => t.id)).toEqual(['whatsapp', 'instagram', 'copy', 'native']);
  });
});
