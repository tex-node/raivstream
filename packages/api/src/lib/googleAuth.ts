/**
 * Google OAuth ID-token verification (server-only).
 *
 * Both the web Google Identity Services button and the Expo mobile flow hand
 * the server a Google ID token (JWT). We verify it directly with Google's
 * tokeninfo endpoint — no extra dependencies — and the caller (authService)
 * maps the verified identity onto a Raivstream user.
 *
 * Never import from client components. No secrets are read here beyond the
 * configured client IDs (public values, also shipped to clients).
 */

export interface VerifiedGoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Client IDs accepted as token audience (web + iOS + Android). */
export function allowedGoogleClientIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.GOOGLE_CLIENT_IDS ?? env.GOOGLE_CLIENT_ID ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface TokeninfoResponse {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string | number;
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'UNAUTHORIZED' as const });
}

/**
 * Verify a Google ID token and return the verified identity.
 * Throws with code UNAUTHORIZED on any failure (never reveals which check failed
 * beyond a generic message — aud mismatches and expiries are common, not attacks).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  deps: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv; nowSec?: number } = {},
): Promise<VerifiedGoogleIdentity> {
  if (!idToken || idToken.length > 8192) fail('Invalid Google credential');

  const env = deps.env ?? process.env;
  const allowed = allowedGoogleClientIds(env);
  if (allowed.length === 0) fail('Google sign-in is not configured');

  const doFetch = deps.fetchImpl ?? fetch;
  let payload: TokeninfoResponse;
  try {
    const res = await doFetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) fail('Google could not verify this credential');
    payload = (await res.json()) as TokeninfoResponse;
  } catch (err) {
    if ((err as Error & { code?: string })?.code === 'UNAUTHORIZED') throw err;
    fail('Google could not verify this credential');
  }

  if (!payload.sub) fail('Google could not verify this credential');
  if (!VALID_ISSUERS.has(payload.iss ?? '')) fail('Google could not verify this credential');
  if (!payload.aud || !allowed.includes(payload.aud)) fail('Google could not verify this credential');

  const exp = Number(payload.exp);
  const now = deps.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp <= now) fail('Google credential has expired');

  if (!payload.email) fail('Google account has no email address');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) fail('Google email address is not verified');

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.picture ? { picture: payload.picture } : {}),
  };
}
