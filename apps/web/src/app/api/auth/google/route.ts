import { z } from 'zod';
import { prisma } from '@raivstream/database';
import { googleAuthUser } from '@raivstream/api/src/lib/authService';
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';
import { buildAuthCookies, jsonResponse } from '@/lib/cookies';

const schema = z.object({
  idToken: z.string().min(1).max(8192),
});

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);

  // ── Rate limit: 10 attempts per 15 minutes per IP ───────────────────────────
  const limit = await rateLimit('google-login', ip, { max: 10, windowSec: 900 });
  if (!limit.success) return rateLimitResponse(limit);

  // ── Parse and validate input ───────────────────────────────────────────────
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

  // ── Authenticate via Google ────────────────────────────────────────────────
  try {
    const { accessToken, refreshToken, user } = await googleAuthUser(prisma, parsed.data.idToken);

    const cookies = buildAuthCookies(accessToken, refreshToken, user);
    return jsonResponse({ user }, 200, cookies);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'TOO_MANY_REQUESTS') {
      return jsonResponse({ error: e.message }, 429);
    }
    // Generic message — never reveal whether an account exists
    return jsonResponse({ error: 'Google sign-in failed — please try again' }, 401);
  }
}
