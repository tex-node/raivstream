import { describe, it, expect, vi } from 'vitest';
import { allowedGoogleClientIds, verifyGoogleIdToken } from '../googleAuth';

vi.mock('../jwt', () => ({
  signAccessToken: () => 'test-access-token',
  signRefreshToken: () => 'test-refresh-token',
  verifyRefreshToken: () => ({ sub: 'u1', family: 'f1' }),
}));

// Imported after the jwt mock so authService picks up the stub.
import { googleAuthUser } from '../authService';

const CLIENT = 'web-id.apps.googleusercontent.com';
const ENV = { GOOGLE_CLIENT_ID: CLIENT };

function tokeninfo(payload: Record<string, unknown>, ok = true, status = 400) {
  return vi.fn(async () =>
    ok
      ? ({ ok: true, json: async () => payload } as unknown as Response)
      : ({ ok: false, status, text: async () => 'bad token' } as unknown as Response),
  );
}

function validPayload(over: Record<string, unknown> = {}) {
  return {
    iss: 'accounts.google.com',
    aud: CLIENT,
    sub: 'google-sub-1',
    email: 'Ada@Example.COM',
    email_verified: 'true',
    name: 'Ada Lovelace',
    picture: 'https://example.com/ada.png',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...over,
  };
}

describe('Google ID-token verification', () => {
  it('accepts a valid token and normalizes the email', async () => {
    const identity = await verifyGoogleIdToken('tok', {
      fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch,
      env: ENV,
    });
    expect(identity).toMatchObject({ googleId: 'google-sub-1', email: 'ada@example.com' });
  });

  it('reads multiple client IDs from GOOGLE_CLIENT_IDS', () => {
    expect(allowedGoogleClientIds({ GOOGLE_CLIENT_IDS: 'a, b ,,c' })).toEqual(['a', 'b', 'c']);
    expect(allowedGoogleClientIds({ GOOGLE_CLIENT_ID: CLIENT })).toEqual([CLIENT]);
    expect(allowedGoogleClientIds({})).toEqual([]);
  });

  it('rejects wrong audience, unverified email, expired and failed tokens', async () => {
    await expect(
      verifyGoogleIdToken('tok', { fetchImpl: tokeninfo(validPayload({ aud: 'other' })) as unknown as typeof fetch, env: ENV }),
    ).rejects.toThrow();
    await expect(
      verifyGoogleIdToken('tok', { fetchImpl: tokeninfo(validPayload({ email_verified: 'false' })) as unknown as typeof fetch, env: ENV }),
    ).rejects.toThrow(/not verified/);
    await expect(
      verifyGoogleIdToken('tok', { fetchImpl: tokeninfo(validPayload({ exp: 1 })) as unknown as typeof fetch, env: ENV }),
    ).rejects.toThrow(/expired/);
    await expect(
      verifyGoogleIdToken('tok', { fetchImpl: tokeninfo({}, false) as unknown as typeof fetch, env: ENV }),
    ).rejects.toThrow();
    await expect(
      verifyGoogleIdToken('tok', { fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch, env: {} }),
    ).rejects.toThrow(/not configured/);
  });
});

function mockPrisma(seed: { users?: Record<string, any>[] } = {}) {
  const users: Record<string, any>[] = (seed.users ?? []).map((u) => ({ ...u }));
  const prisma: Record<string, any> = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.googleId !== undefined)
          return users.find((u) => u.googleId === where.googleId) ?? null;
        if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
        if (where.username !== undefined) return users.find((u) => u.username === where.username) ?? null;
        if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
        return null;
      },
      create: async ({ data }: any) => {
        const user = { id: `u${users.length + 1}`, role: 'VIEWER', premiumTier: 'FREE', verified: false, ...data };
        users.push(user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id)!;
        Object.assign(user, data);
        return user;
      },
    },
    refreshToken: { create: async () => ({ id: 'rt1' }) },
  };
  return { prisma: prisma as never, users };
}

describe('googleAuthUser', () => {
  it('creates a passwordless, verified user on first sign-in', async () => {
    const { prisma, users } = mockPrisma();
    const result = await googleAuthUser(prisma as never, 'tok', {
      fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch,
      env: ENV,
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'ada@example.com',
      username: 'ada',
      passwordHash: null,
      googleId: 'google-sub-1',
      verified: true,
    });
    expect(result).toMatchObject({ accessToken: 'test-access-token', refreshToken: 'test-refresh-token' });
  });

  it('signs in the existing Google-linked account by googleId', async () => {
    const { prisma } = mockPrisma({
      users: [{ id: 'u1', email: 'ada@example.com', username: 'ada', googleId: 'google-sub-1', verified: true, role: 'VIEWER', premiumTier: 'FREE', avatarUrl: null, followerCount: 0, followingCount: 0, totalViews: 0, totalLikes: 0 }],
    });
    const result = await googleAuthUser(prisma as never, 'tok', {
      fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch,
      env: ENV,
    });
    expect(result.user).toMatchObject({ id: 'u1', email: 'ada@example.com' });
  });

  it('links a pre-existing password account by verified email', async () => {
    const { prisma, users } = mockPrisma({
      users: [{ id: 'u1', email: 'ada@example.com', username: 'ada', googleId: null, passwordHash: 'hash', verified: false, role: 'VIEWER', premiumTier: 'FREE', avatarUrl: null, followerCount: 0, followingCount: 0, totalViews: 0, totalLikes: 0 }],
    });
    await googleAuthUser(prisma as never, 'tok', {
      fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch,
      env: ENV,
    });
    expect(users[0]).toMatchObject({ googleId: 'google-sub-1', verified: true, passwordHash: 'hash' });
  });

  it('derives a unique username when the email prefix is taken', async () => {
    const { prisma, users } = mockPrisma({
      users: [{ id: 'u1', email: 'other@example.com', username: 'ada', googleId: 'g-x', role: 'VIEWER', premiumTier: 'FREE' }],
    });
    await googleAuthUser(prisma as never, 'tok', {
      fetchImpl: tokeninfo(validPayload()) as unknown as typeof fetch,
      env: ENV,
    });
    expect(users[1].username).toBe('ada_1');
  });
});
