import { NextRequest, NextResponse } from 'next/server';

// ─── Routes requiring authentication ─────────────────────────────────────────
// UX-only redirect — actual security is enforced server-side by tRPC protectedProcedure.
// The JWT in the raiv_at httpOnly cookie is validated on every API call.
const PROTECTED_ROUTES = [
  '/upload',
  '/analytics',
  '/settings',
  '/subscription',
  '/generate',
  '/admin',
];

// ─── Security headers ─────────────────────────────────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options':        'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy':        'strict-origin-when-cross-origin',
  'Permissions-Policy':     'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.x.ai https://api.runpod.ai https://api.stripe.com wss:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── HTTPS redirect (production only) ──────────────────────────────────────
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers.get('x-forwarded-proto') === 'http'
  ) {
    const httpsUrl = req.nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // ── Auth redirect — check httpOnly access token cookie ────────────────────
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (isProtected) {
    // Read the real access token cookie (set by /api/auth/login, httpOnly)
    const hasAuth = !!req.cookies.get('raiv_at')?.value;
    if (!hasAuth) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // ── Attach security headers to all page / API responses ───────────────────
  const response = NextResponse.next();

  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => response.headers.set(k, v));

  // HSTS: only in production (would break local dev on HTTP)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  return response;
}

export const config = {
  // Apply to all routes except Next.js internals and static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
