import { prisma } from '@raivstream/database';
import { refreshTokens } from '@raivstream/api/src/lib/authService';
import { rateLimitRoute } from '@/lib/rateLimit';
import { buildAuthCookies, buildClearCookies, getCookieValue, jsonResponse, COOKIE_NAMES } from '@/lib/cookies';

export async function POST(req: Request): Promise<Response> {
  // ── Rate limit: 30 refreshes per 15 minutes per IP ───────────────────────
  // (generous limit since legitimate clients auto-refresh every 15 min)
  const limited = await rateLimitRoute(req, 'authRefresh');
  if (limited) return limited;

  // ── Read refresh token from httpOnly cookie ───────────────────────────────
  // (the raiv_rt cookie is scoped to Path=/api/auth/refresh so it's only sent here)
  const rawRefreshToken = getCookieValue(req, COOKIE_NAMES.refresh);
  if (!rawRefreshToken) {
    return jsonResponse({ error: 'No refresh token' }, 401);
  }

  try {
    const { accessToken, refreshToken, user } = await refreshTokens(prisma, rawRefreshToken);
    const cookies = buildAuthCookies(accessToken, refreshToken, user);
    return jsonResponse({ user }, 200, cookies);
  } catch (err) {
    // A parallel refresh (common with multiple tabs sharing the raiv_rt cookie,
    // or overlapping retries after a server restart) already rotated the cookie
    // on this browser. The session is still valid — don't clear cookies, just
    // tell the client to re-sync.
    if ((err as { code?: string } | null)?.code === 'CONCURRENT_REFRESH') {
      return jsonResponse({ error: 'Refresh already completed by a parallel request' }, 409);
    }
    // Clear cookies on any real refresh failure — force re-login
    return jsonResponse({ error: 'Session expired — please sign in again' }, 401, buildClearCookies());
  }
}
