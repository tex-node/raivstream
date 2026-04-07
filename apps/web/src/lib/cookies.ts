/**
 * httpOnly cookie utilities for server-side token storage.
 *
 * Security properties of all auth cookies:
 *   httpOnly  = true  → inaccessible to JavaScript (prevents XSS token theft)
 *   secure    = true  → HTTPS only in production
 *   sameSite  = lax   → sent on top-level navigations, blocked on cross-site POSTs (CSRF protection)
 *   path      = /     → access cookie available everywhere (refresh cookie scoped to /api/auth/refresh)
 */

const IS_PROD = process.env.NODE_ENV === 'production';

export const COOKIE_NAMES = {
  access:  'raiv_at',   // httpOnly access token (15 min)
  refresh: 'raiv_rt',   // httpOnly refresh token (30 days)
  user:    'raiv_user', // readable user data (non-sensitive, for client-side display)
} as const;

// Access token: 15 minutes
export const ACCESS_MAX_AGE  = 15 * 60;
// Refresh token: 30 days
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

type SameSite = 'strict' | 'lax' | 'none';

function buildCookieString(
  name:    string,
  value:   string,
  maxAge:  number,
  options: { httpOnly?: boolean; sameSite?: SameSite; path?: string } = {}
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${options.path ?? '/'}`,
    `SameSite=${options.sameSite ?? 'lax'}`,
  ];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}

/** Build the Set-Cookie headers to send on successful login/register/refresh */
export function buildAuthCookies(
  accessToken:  string,
  refreshToken: string,
  user:         object
): string[] {
  return [
    // httpOnly access token
    buildCookieString(COOKIE_NAMES.access, accessToken, ACCESS_MAX_AGE, {
      httpOnly: true,
      path:     '/',
    }),
    // httpOnly refresh token — scoped to the refresh endpoint only
    buildCookieString(COOKIE_NAMES.refresh, refreshToken, REFRESH_MAX_AGE, {
      httpOnly: true,
      path:     '/api/auth/refresh',
    }),
    // Readable user cookie (non-sensitive — no tokens, no passwordHash)
    buildCookieString(COOKIE_NAMES.user, JSON.stringify(user), REFRESH_MAX_AGE, {
      httpOnly: false,
      sameSite: 'lax',
      path:     '/',
    }),
  ];
}

/** Build Set-Cookie headers that clear all auth cookies (used on logout) */
export function buildClearCookies(): string[] {
  const expired = (name: string, path = '/') =>
    `${name}=; Max-Age=0; Path=${path}; SameSite=Lax${IS_PROD ? '; Secure' : ''}; HttpOnly`;

  return [
    expired(COOKIE_NAMES.access),
    expired(COOKIE_NAMES.refresh, '/api/auth/refresh'),
    `${COOKIE_NAMES.user}=; Max-Age=0; Path=/; SameSite=Lax${IS_PROD ? '; Secure' : ''}`,
  ];
}

/** Read a cookie value from a Next.js Request */
export function getCookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Apply Set-Cookie headers to a Response */
export function applyCookies(response: Response, cookies: string[]): Response {
  cookies.forEach((c) => response.headers.append('Set-Cookie', c));
  return response;
}

/** Generic JSON API response factory */
export function jsonResponse(
  body:    unknown,
  status:  number = 200,
  cookies: string[] = []
): Response {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return cookies.length ? applyCookies(res, cookies) : res;
}
