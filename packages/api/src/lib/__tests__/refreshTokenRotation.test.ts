import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';

/**
 * Concurrency correctness for refresh-token rotation.
 *
 * The bug this guards against: two overlapping refreshes carrying the *same*
 * still-valid token (multiple browser tabs share one httpOnly `raiv_rt` cookie;
 * clients also fire overlapping refreshes when reconnecting after a server
 * restart) both validate the token, then both try to delete the same row.
 * With `prisma.refreshToken.delete()` the loser threw Prisma P2025
 * ("Record to delete does not exist") — logged on the VPS at every restart —
 * and, on a client retry, could escalate to nuking the whole token family and
 * logging the user out everywhere.
 *
 * Expected behaviour now: exactly one refresh wins; every loser is rejected
 * with `code: 'CONCURRENT_REFRESH'` (never P2025, never a family wipe), and the
 * family always retains exactly one usable token.
 */

// jwt.ts reads these at module load — set before importing authService.
process.env.JWT_ACCESS_SECRET  ||= 'test-access-secret-not-for-production';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-not-for-production';

type Row = {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

const SAFE_USER = {
  id: 'user-1',
  email: 'a@b.com',
  username: 'user1',
  displayName: 'User One',
  avatarUrl: null,
  role: 'VIEWER',
  premiumTier: 'FREE',
  verified: false,
  followerCount: 0,
  followingCount: 0,
  totalViews: 0,
  totalLikes: 0,
};

function makePrisma(seed: Row[]) {
  const state = { rows: [...seed], seq: seed.length };

  const client: any = {
    refreshToken: {
      findMany: async ({ where }: any) =>
        state.rows
          .filter((r) => r.userId === where.userId && r.family === where.family)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((r) => ({ ...r })),

      deleteMany: async ({ where }: any) => {
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => {
          if (where.id) return r.id !== where.id;
          if (where.userId && where.family) return !(r.userId === where.userId && r.family === where.family);
          if (where.userId) return r.userId !== where.userId;
          return false;
        });
        return { count: before - state.rows.length };
      },

      // Present so an accidental regression back to .delete() would surface
      // the exact production error instead of silently passing.
      delete: async ({ where }: any) => {
        const idx = state.rows.findIndex((r) => r.id === where.id);
        if (idx === -1) {
          throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
        }
        return state.rows.splice(idx, 1)[0];
      },

      create: async ({ data }: any) => {
        const row: Row = {
          id: `rt-${++state.seq}`,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
        };
        state.rows.push(row);
        return { ...row };
      },
    },

    user: {
      findUnique: async () => ({ ...SAFE_USER }),
    },

    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(client),
  };

  return { client, state };
}

function familyRow(overrides: Partial<Row>): Row {
  return {
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'placeholder',
    family: 'fam-1',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

let refreshTokens: typeof import('../authService').refreshTokens;
let signRefreshToken: typeof import('../jwt').signRefreshToken;

beforeAll(async () => {
  ({ refreshTokens } = await import('../authService'));
  ({ signRefreshToken } = await import('../jwt'));
});

describe('refreshTokens — concurrent refresh race', () => {
  it('rejects the losing side of two simultaneous refreshes as CONCURRENT_REFRESH, never P2025', async () => {
    const raw = signRefreshToken('user-1', 'fam-1');
    const tokenHash = await bcrypt.hash(raw, 10);
    const { client, state } = makePrisma([familyRow({ tokenHash })]);

    const results = await Promise.allSettled([
      refreshTokens(client, raw),
      refreshTokens(client, raw),
    ]);

    // At least one succeeds; any failure is the benign concurrency signal, not
    // a raw Prisma "Record to delete does not exist" (P2025) and not a family
    // wipe (UNAUTHORIZED from the reuse branch).
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect((r.reason as { code?: string }).code).toBe('CONCURRENT_REFRESH');
        expect((r.reason as Error).message).not.toMatch(/does not exist/i);
      }
    }
    // The family is never left empty or multiplied — one live token remains.
    expect(state.rows).toHaveLength(1);
  });

  it('never throws Prisma P2025 and never wipes the family under a burst of refreshes', async () => {
    const raw = signRefreshToken('user-1', 'fam-1');
    const tokenHash = await bcrypt.hash(raw, 10);
    const { client, state } = makePrisma([familyRow({ tokenHash })]);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => refreshTokens(client, raw)),
    );

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect((r.reason as { code?: string }).code).toBe('CONCURRENT_REFRESH');
        expect((r.reason as Error).message).not.toMatch(/does not exist/i);
      }
    }
    expect(state.rows).toHaveLength(1);
  });

  it('still treats reuse of an old token (family rotated long ago) as an attack and revokes the family', async () => {
    const staleRaw = signRefreshToken('user-1', 'fam-1');
    // Current head is an unrelated token (bcrypt only hashes the first 72 bytes,
    // so it must differ within that prefix — not just by a suffix), created well
    // outside the grace window.
    const headHash = await bcrypt.hash('unrelated-current-head-token-value', 10);
    const { client, state } = makePrisma([
      familyRow({ id: 'rt-head', tokenHash: headHash, createdAt: new Date(Date.now() - 5 * 60 * 1000) }),
    ]);

    await expect(refreshTokens(client, staleRaw)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(state.rows).toHaveLength(0); // entire family wiped
  });

  it('rotates cleanly and returns a fresh token pair for a single refresh', async () => {
    const raw = signRefreshToken('user-1', 'fam-1');
    const tokenHash = await bcrypt.hash(raw, 10);
    const { client, state } = makePrisma([familyRow({ tokenHash })]);

    const result = await refreshTokens(client, raw);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.id).toBe('user-1');
    // Rotation happened: the original row is gone and a distinct row took its
    // place. (The raw JWT string itself can repeat when two signs land in the
    // same second — identity is proven by the row id + freshly-salted hash.)
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].id).not.toBe('rt-1');
    expect(state.rows[0].tokenHash).not.toBe(tokenHash);
    expect(await bcrypt.compare(result.refreshToken, state.rows[0].tokenHash)).toBe(true);
  });
});
