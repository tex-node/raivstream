import { z } from 'zod';
import { prisma } from '@raivstream/database';
import { loginUser } from '@raivstream/api/src/lib/authService';
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';
import { buildAuthCookies, jsonResponse } from '@/lib/cookies';

const schema = z.object({
  email:    z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);

  // ── Rate limit: 5 attempts per 15 minutes per IP ──────────────────────────
  const limit = await rateLimit('login', ip, { max: 5, windowSec: 900 });
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

  // ── Authenticate ──────────────────────────────────────────────────────────
  try {
    const { accessToken, refreshToken, user } = await loginUser(prisma, parsed.data);

    const cookies = buildAuthCookies(accessToken, refreshToken, user);
    return jsonResponse({ user }, 200, cookies);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'TOO_MANY_REQUESTS') {
      return jsonResponse({ error: e.message }, 429);
    }
    // Return generic message — never reveal whether email exists
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }
}
