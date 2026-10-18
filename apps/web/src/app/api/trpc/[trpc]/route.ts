import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@raivstream/api';
import { prisma } from '@raivstream/database';
import { verifyAccessToken, extractBearerToken } from '@raivstream/api/src/lib/jwt';
import { releaseStuckReservations } from '@raivstream/api/src/lib/credits';
import { validateEnv, getAllowedOrigins } from '@/lib/env';
import { COOKIE_NAMES, getCookieValue } from '@/lib/cookies';

// Validate required environment variables on every cold start
validateEnv();

// ── D-043 safety net: release orphaned HELD credit reservations ──────────────
// A process that dies between reserve and settle leaves a HELD row that no
// request will ever revisit. This runs once per server process, fire-and-forget
// (it must never delay or fail a request) and is idempotent — releaseCredits
// no-ops on terminal rows. Skipped during `next build`, when Next.js imports
// route modules but no server is serving traffic.
const sweepGlobal = globalThis as typeof globalThis & { __rvStuckReservationSweepStarted?: boolean };
if (
  !sweepGlobal.__rvStuckReservationSweepStarted
  && process.env.NODE_ENV !== 'test'
  && process.env.NEXT_PHASE !== 'phase-production-build'
) {
  sweepGlobal.__rvStuckReservationSweepStarted = true;
  void releaseStuckReservations(prisma)
    .then(({ scanned, released }) => {
      console.info(`[credits.sweep] scanned=${scanned} released=${released}`);
    })
    .catch((err: unknown) => {
      console.error('[credits.sweep] failed:', err instanceof Error ? err.message : err);
    });
}

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
  const host = req.headers.get('host') ?? '';
  const url = new URL(req.url);
  const isR16 = req.headers.get('x-r16-mode') === '1' || host.startsWith('r16.') || url.searchParams.get('r16') === '1';

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      // Client IP for the unauthenticated rate-limit bucket. Behind Caddy the
      // real address is the first entry of x-forwarded-for.
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || null;
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

      return { prisma, user, userId, isR16, ip };
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
