import { z } from 'zod';
import { prisma } from '@raivstream/database';
import { registerUser } from '@raivstream/api/src/lib/authService';
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';
import { buildAuthCookies, jsonResponse } from '@/lib/cookies';

const schema = z.object({
  email:       z.string().email().max(254).toLowerCase().trim(),
  password:    z.string().min(8).max(128),
  username:    z.string().min(3).max(30).regex(
    /^[a-z0-9_]+$/,
    'Username must be lowercase letters, numbers, or underscores'
  ).toLowerCase().trim(),
  displayName: z.string().min(1).max(50).trim(),
});

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);

  // ── Rate limit: 3 registrations per 15 minutes per IP ────────────────────
  const limit = await rateLimit('register', ip, { max: 3, windowSec: 900 });
  if (!limit.success) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      422
    );
  }

  try {
    const { accessToken, refreshToken, user } = await registerUser(prisma, parsed.data);

    const cookies = buildAuthCookies(accessToken, refreshToken, user);
    return jsonResponse({ user }, 201, cookies);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'CONFLICT') {
      // Generic message — don't reveal whether email or username is taken
      return jsonResponse({ error: 'An account with those details already exists' }, 409);
    }
    console.error('[register] unexpected error:', e.message);
    return jsonResponse({ error: 'Registration failed — please try again' }, 500);
  }
}
