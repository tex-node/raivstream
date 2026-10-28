import { z } from 'zod';
import { prisma } from '@raivstream/database';
import { googleAuthUser } from '@raivstream/api/src/lib/authService';
import { rateLimitRoute } from '@/lib/rateLimit';
import { buildAuthCookies, jsonResponse } from '@/lib/cookies';

const schema = z.object({
  idToken: z.string().min(1).max(8192),
});

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit: 10 attempts per 15 minutes per IP ───────────────────────────
  const limited = await rateLimitRoute(req, 'authGoogleLogin');
  if (limited) return limited;

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
    // Log the real reason server-side. The generic message the user sees is
    // correct (never reveal whether an account exists), but without this line we
    // are blind — the earlier failures had to be diagnosed by guesswork.
    console.warn('[auth.google] sign-in failed', { code: e.code ?? 'unknown', message: e.message });

    // A reason code lets the UI say something useful without leaking internals.
    const reason =
      e.code === 'INVALID_TOKEN' || /token/i.test(e.message) ? 'invalid_token'
      : /audience|aud/i.test(e.message) ? 'audience_mismatch'
      : /email|verif/i.test(e.message) ? 'email_unverified'
      : 'unknown';

    return jsonResponse(
      { error: 'Google sign-in failed. Please try again, or use email and password.', reason },
      401,
    );
  }
}
