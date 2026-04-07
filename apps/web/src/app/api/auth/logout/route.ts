import { prisma } from '@raivstream/database';
import { verifyAccessToken } from '@raivstream/api/src/lib/jwt';
import { logoutUser, logoutAllDevices } from '@raivstream/api/src/lib/authService';
import { buildClearCookies, getCookieValue, jsonResponse, COOKIE_NAMES } from '@/lib/cookies';
import { z } from 'zod';

const schema = z.object({
  allDevices: z.boolean().optional().default(false),
});

export async function POST(req: Request): Promise<Response> {
  // Identify user from the access token cookie
  const accessToken    = getCookieValue(req, COOKIE_NAMES.access);
  const rawRefreshToken = getCookieValue(req, COOKIE_NAMES.refresh);

  let userId: string | null = null;
  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      userId = payload.sub;
    } catch {
      // Expired or invalid — clear cookies anyway
    }
  }

  if (userId) {
    try {
      let allDevices = false;
      try {
        const body = await req.json();
        const parsed = schema.safeParse(body);
        allDevices = parsed.success ? parsed.data.allDevices : false;
      } catch { /* no body is fine */ }

      if (allDevices) {
        await logoutAllDevices(prisma, userId);
      } else {
        await logoutUser(prisma, userId, rawRefreshToken ?? undefined);
      }
    } catch {
      // Don't fail logout if DB operation fails — still clear cookies
    }
  }

  // Always clear cookies, even if no session was found on the server
  // (client-side logout must always succeed)
  return jsonResponse({ success: true }, 200, buildClearCookies());
}
