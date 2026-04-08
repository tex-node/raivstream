/**
 * Shared authentication business logic.
 * Used by both the tRPC auth router (mobile) and the Next.js /api/auth/* routes (web).
 * Keeping logic here prevents duplication and ensures lockout/rate-limit rules
 * are enforced uniformly regardless of the calling surface.
 */

import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';
import type { PrismaClient } from '@raivstream/database';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';

export const BCRYPT_ROUNDS = 12;

// Maximum consecutive failed logins before account lockout
const MAX_FAILED_ATTEMPTS = 10;
// How long to lock an account after too many failures (ms)
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Fields safe to return in any API response (no passwordHash, no internal flags)
export const SAFE_USER_SELECT = {
  id:             true,
  email:          true,
  username:       true,
  displayName:    true,
  avatarUrl:      true,
  role:           true,
  premiumTier:    true,
  verified:       true,
  followerCount:  true,
  followingCount: true,
  totalViews:     true,
  totalLikes:     true,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  email:       string;
  password:    string;
  username:    string;
  displayName: string;
}

export interface LoginInput {
  email:    string;
  password: string;
}

export interface AuthResult {
  accessToken:  string;
  refreshToken: string;
  user: {
    id:             string;
    email:          string;
    username:       string;
    displayName:    string;
    avatarUrl:      string | null;
    role:           string;
    premiumTier:    string;
    verified:       boolean;
    followerCount:  number;
    followingCount: number;
    totalViews:     number;
    totalLikes:     number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(
  prisma: PrismaClient,
  user: { id: string; email: string; username: string; role: string; premiumTier: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const family    = randomUUID();
  const accessToken  = signAccessToken({ sub: user.id, email: user.email, username: user.username, role: user.role, premiumTier: user.premiumTier });
  const rawRefresh   = signRefreshToken(user.id, family);
  const refreshHash  = await bcrypt.hash(rawRefresh, 10);

  await prisma.refreshToken.create({
    data: {
      userId:    user.id,
      tokenHash: refreshHash,
      family,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken: rawRefresh };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser(prisma: PrismaClient, input: RegisterInput): Promise<AuthResult> {
  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email.toLowerCase() } }),
    prisma.user.findUnique({ where: { username: input.username.toLowerCase() } }),
  ]);

  // Avoid revealing which field is taken — return the same message for both
  if (existingEmail || existingUsername) {
    // Hash anyway for constant-time response
    await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    throw Object.assign(new Error('An account with those details already exists'), { code: 'CONFLICT' as const });
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email:        input.email.toLowerCase().trim(),
      username:     input.username.toLowerCase().trim(),
      displayName:  input.displayName.trim(),
      passwordHash,
    },
    select: SAFE_USER_SELECT,
  });

  const tokens = await issueTokenPair(prisma, user);
  return { ...tokens, user };
}

// ─── Login ────────────────────────────────────────────────────────────────────

const DUMMY_HASH = '$2b$12$invaliddummyhashtopreventtimingattacks00000000000000000';

export async function loginUser(prisma: PrismaClient, input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: {
      ...SAFE_USER_SELECT,
      passwordHash:       true,
      failedLoginAttempts: true,
      lockedUntil:        true,
    },
  });

  // Always run bcrypt regardless of whether user exists — prevents user enumeration via timing
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(input.password, hash);

  // Check lockout AFTER bcrypt (maintains constant time)
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw Object.assign(
      new Error(`Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`),
      { code: 'TOO_MANY_REQUESTS' as const }
    );
  }

  if (!user || !valid) {
    // Increment failed attempts
    if (user) {
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      });
    }
    throw Object.assign(new Error('Invalid email or password'), { code: 'UNAUTHORIZED' as const });
  }

  // Success — reset lockout counters
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  const { passwordHash: _ph, failedLoginAttempts: _fa, lockedUntil: _lu, ...safeUser } = user;
  const tokens = await issueTokenPair(prisma, safeUser);
  return { ...tokens, user: safeUser };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshTokens(prisma: PrismaClient, rawRefreshToken: string): Promise<AuthResult> {
  let payload: { sub: string; family: string };
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { code: 'UNAUTHORIZED' as const });
  }

  const familyTokens = await prisma.refreshToken.findMany({
    where: { userId: payload.sub, family: payload.family },
    orderBy: { createdAt: 'desc' },
  });

  if (familyTokens.length === 0) {
    throw Object.assign(new Error('Session not found'), { code: 'UNAUTHORIZED' as const });
  }

  const latest = familyTokens[0];
  const matches = await bcrypt.compare(rawRefreshToken, latest.tokenHash);

  if (!matches) {
    // Token reuse detected — revoke entire family immediately (replay attack)
    await prisma.refreshToken.deleteMany({ where: { userId: payload.sub, family: payload.family } });
    throw Object.assign(new Error('Session invalidated — please sign in again'), { code: 'UNAUTHORIZED' as const });
  }

  if (latest.revokedAt || latest.expiresAt < new Date()) {
    throw Object.assign(new Error('Session expired'), { code: 'UNAUTHORIZED' as const });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: SAFE_USER_SELECT });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' as const });

  // Rotate: delete old, issue new in same family
  await prisma.refreshToken.delete({ where: { id: latest.id } });

  const newRaw    = signRefreshToken(user.id, payload.family);
  const newHash   = await bcrypt.hash(newRaw, 10);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: newHash, family: payload.family, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  const newAccess = signAccessToken({ sub: user.id, email: user.email, username: user.username, role: user.role, premiumTier: user.premiumTier });
  return { accessToken: newAccess, refreshToken: newRaw, user };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutUser(
  prisma: PrismaClient,
  userId: string,
  rawRefreshToken?: string
): Promise<void> {
  if (rawRefreshToken) {
    try {
      const payload = verifyRefreshToken(rawRefreshToken);
      // Only revoke the family belonging to the calling user (prevent IDOR)
      if (payload.sub === userId) {
        await prisma.refreshToken.deleteMany({ where: { userId, family: payload.family } });
      }
    } catch {
      // Token already invalid — still succeed (idempotent)
    }
  }
}

export async function logoutAllDevices(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

// ─── Password reset ───────────────────────────────────────────────────────────

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a password reset token for the given email.
 * Returns the raw token (to be embedded in the reset URL) and the userId.
 * Always succeeds even if the email doesn't exist — prevents user enumeration.
 */
export async function requestPasswordReset(
  prisma: PrismaClient,
  email:  string,
): Promise<{ rawToken: string; userId: string } | null> {
  const user = await prisma.user.findUnique({
    where:  { email: email.toLowerCase() },
    select: { id: true },
  });

  // Return null silently — caller should still respond with 200
  if (!user) return null;

  // Invalidate all previous reset tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const rawToken  = randomBytes(32).toString('hex'); // 64-char hex string
  const tokenHash = await bcrypt.hash(rawToken, 10);

  await prisma.passwordResetToken.create({
    data: {
      userId:    user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    },
  });

  return { rawToken, userId: user.id };
}

/**
 * Consume a password-reset token and update the user's password.
 * Throws with code UNAUTHORIZED if the token is invalid, expired, or already used.
 */
export async function resetPassword(
  prisma:       PrismaClient,
  rawToken:     string,
  newPassword:  string,
): Promise<void> {
  // Find all unexpired, unused tokens and check which one matches
  const candidates = await prisma.passwordResetToken.findMany({
    where: {
      expiresAt: { gt: new Date() },
      usedAt:    null,
    },
    orderBy: { createdAt: 'desc' },
    take:    50, // safety cap
  });

  let matched: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    const ok = await bcrypt.compare(rawToken, candidate.tokenHash);
    if (ok) { matched = candidate; break; }
  }

  if (!matched) {
    throw Object.assign(
      new Error('Reset link is invalid or has expired. Please request a new one.'),
      { code: 'UNAUTHORIZED' as const },
    );
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Atomically: mark token used + update password + invalidate all sessions
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: matched.id },
      data:  { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: matched.userId },
      data:  { passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    // Revoke all active sessions so stolen sessions can't persist
    prisma.refreshToken.deleteMany({ where: { userId: matched.userId } }),
  ]);
}
