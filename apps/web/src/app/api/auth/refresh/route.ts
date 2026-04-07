import { prisma } from '@raivstream/database';
import { refreshTokens } from '@raivstream/api/src/lib/authService';
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';
import { buildAuthCookies, buildClearCookies, getCookieValue, jsonResponse, COOKIE_NAMES } from '@/lib/cookies';

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);

  // ── Rate limit: 30 refreshes per 15 minutes per IP ───────────────────────
  // (generous limit since legitimate clients auto-refresh every 15 min)
  const limit = await rateLimit('refresh', ip, { max: 30, windowSec: 900 });
  if (!limit.success) return rateLimitResponse(limit);

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
  } catch {
    // Clear cookies on any refresh failure — force re-login
    return jsonResponse({ error: 'Session expired — please sign in again' }, 401, buildClearCookies());
  }
}
