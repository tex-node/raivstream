import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A balance that is always visible, and never stale (2026-11-08).
 *
 * The read found no header indicator and - more importantly - **no mutation invalidating
 * `user.creditBalance`**: /generate refetches by hand, everything else would freeze at mount. So the
 * indicator refetches rather than depending on invalidation, and these tests pin that, the R16
 * decision, and the no-flashed-zero rule.
 */

const PILL = join(__dirname, 'CreditBalancePill.tsx');
const NAVBAR = join(__dirname, '..', 'layout', 'Navbar.tsx');

describe('the balance indicator', () => {
  const source = readFileSync(PILL, 'utf8');

  it('reads the balance from the existing query', () => {
    expect(source).toContain('trpc.user.creditBalance.useQuery');
  });

  it('cannot go stale by design: refetches on focus and on an interval', () => {
    expect(source).toContain('refetchOnWindowFocus: true');
    expect(source).toContain('refetchInterval:');
  });

  it('never flashes a wrong number during load', () => {
    // Check the code, not the prose: the doc comment explains the rule and names the pattern.
    expect(source).not.toContain('balance ?? 0');
    expect(source).not.toMatch(/\{data\.balance[^}]*\}\s*\?\?/);
    expect(source).toContain('animate-pulse');
  });

  it('is hidden on R16 by decision', () => {
    expect(source).toContain('isR16');
    expect(source).toContain('if (!user || isR16) return null;');
  });

  it('is rendered by the header, not only by /credits', () => {
    const navbar = readFileSync(NAVBAR, 'utf8');
    expect(navbar).toContain('CreditBalancePill');
  });
});
