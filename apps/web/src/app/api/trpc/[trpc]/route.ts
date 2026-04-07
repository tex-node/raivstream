import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@raivstream/api';
import { prisma } from '@raivstream/database';
import { verifyAccessToken, extractBearerToken } from '@raivstream/api/src/lib/jwt';
import { validateEnv, getAllowedOrigins } from '@/lib/env';
import { COOKIE_NAMES, getCookieValue } from '@/lib/cookies';

// Validate required environment variables on every cold start
validateEnv();

const IS_PROD = process.env.NODE_ENV === 'production';

/** Build CORS headers — only allow whitelisted origins */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  const isAllowed = !!origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin':      isAllowed ? origin! : (allowed[0] ?? 'null'),
    'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':           '86400',
  };
}

const handler = (req: Request) => {
  const origin = req.headers.get('origin');

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      // ── Dual-surface token resolution ─────────────────────────────────────
      // Web (same-origin):  browser sends raiv_at as httpOnly cookie automatically
      // Mobile (cross-origin): client sends Authorization: Bearer <token>
      const cookieToken = getCookieValue(req, COOKIE_NAMES.access);
      const headerToken = extractBearerToken(req.headers.get('authorization'));
      const token       = cookieToken ?? headerToken;

      let user   = null;
      let userId: string | null = null;

      if (token) {
        try {
          const payload = verifyAccessToken(token);
          userId = payload.sub;
          user   = await prisma.user.findUnique({
            where:  { id: payload.sub },
            select: {
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
            },
          });
        } catch {
          // Expired or invalid token — serve as unauthenticated
        }
      }

      return { prisma, user, userId };
    },
    responseMeta() {
      return {
        headers: {
          ...corsHeaders(origin),
          'X-Content-Type-Options': 'nosniff',
        },
      };
    },
    onError({ path, error }) {
      if (IS_PROD) {
        // Log INTERNAL_SERVER_ERRORs server-side; never expose stack traces to client
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          console.error(`[tRPC:${path ?? 'unknown'}]`, error.message);
        }
      } else {
        console.error(`[tRPC:${path ?? 'unknown'}]`, error);
      }
    },
  });
};

/** Handle CORS preflight requests */
export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export { handler as GET, handler as POST };
