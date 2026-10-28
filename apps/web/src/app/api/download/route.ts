/**
 * GET /api/download?url=<encoded>&filename=<name>
 *
 * Streams an R2 object through the app so the browser sees a same-origin
 * response and honours `Content-Disposition: attachment`. Cross-origin URLs
 * ignore the HTML `download` attribute, which is why the button used to open a
 * tab instead of saving a file.
 *
 * Two protections, both required:
 *  - authenticated session (JWT cookie), so this is not a public relay;
 *  - the `url` must be an object on our own R2 host, so it cannot be pointed at
 *    arbitrary infrastructure (SSRF) or used to launder other people's traffic.
 *
 * The body is streamed, never buffered: these are multi-megabyte videos.
 */

import { verifyAccessToken } from '@raivstream/api/src/lib/jwt';
import { getCookieValue, COOKIE_NAMES } from '@/lib/cookies';

/** Hosts we are willing to fetch from. Derived from env, plus the r2.dev shape. */
function allowedHosts(): string[] {
  const hosts = new Set<string>(['*.r2.dev', '*.r2.cloudflarestorage.com']);

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) {
    try {
      hosts.add(new URL(publicUrl).hostname);
    } catch {
      /* malformed env - ignore, the patterns still apply */
    }
  }
  return [...hosts];
}

function isAllowedHost(hostname: string): boolean {
  return allowedHosts().some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".r2.dev"
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return hostname === pattern;
  });
}

/** Strip anything that could break out of the header or the filesystem. */
function safeFilename(raw: string | null): string {
  const base = (raw ?? 'video').replace(/\.[a-z0-9]{1,5}$/i, '');
  const cleaned = base.replace(/[^\w\s.-]/g, '').trim().slice(0, 80);
  return `${cleaned || 'video'}.mp4`;
}

export async function GET(req: Request): Promise<Response> {
  const accessToken = getCookieValue(req, COOKIE_NAMES.access);
  if (!accessToken) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    verifyAccessToken(accessToken);
  } catch {
    // Expired is still a session that must refresh before downloading.
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url');
  if (!rawUrl) return new Response('Missing url', { status: 400 });

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
    return new Response('Host not allowed', { status: 403 });
  }

  const upstream = await fetch(target, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
      'Content-Disposition': `attachment; filename="${safeFilename(searchParams.get('filename'))}"`,
      'Content-Length': upstream.headers.get('content-length') ?? '',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
