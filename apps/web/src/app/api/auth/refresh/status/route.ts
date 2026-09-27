import { getCookieValue, jsonResponse, COOKIE_NAMES } from '@/lib/cookies';

// Diagnostic endpoint — safe to call from browser or VPS.
// Returns ONLY boolean presence of each auth cookie; never prints values.
export async function GET(req: Request): Promise<Response> {
  return jsonResponse({
    hasRefreshToken: !!getCookieValue(req, COOKIE_NAMES.refresh),
    hasAccessToken:  !!getCookieValue(req, COOKIE_NAMES.access),
  }, 200);
}
