/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile by reading the httpOnly access token cookie.
 * Called on page load to restore session state without touching localStorage.
 * Also used by the AuthProvider to verify the cookie is still valid after a page refresh.
 */

import { prisma } from '@raivstream/database';
import { verifyAccessToken } from '@raivstream/api/src/lib/jwt';
import { SAFE_USER_SELECT } from '@raivstream/api/src/lib/authService';
import { getCookieValue, jsonResponse, COOKIE_NAMES } from '@/lib/cookies';

export async function GET(req: Request): Promise<Response> {
  const accessToken = getCookieValue(req, COOKIE_NAMES.access);
  if (!accessToken) {
    return jsonResponse({ user: null }, 200);
  }

  try {
    const payload = verifyAccessToken(accessToken);
    const user = await prisma.user.findUnique({
      where:  { id: payload.sub },
      select: SAFE_USER_SELECT,
    });
    return jsonResponse({ user: user ?? null }, 200);
  } catch {
    // Token expired or invalid — return null without error (caller will redirect)
    return jsonResponse({ user: null }, 200);
  }
}
