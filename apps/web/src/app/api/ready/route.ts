/**
 * GET /api/ready
 *
 * Readiness probe (distinct from the liveness `/api/health`). Verifies the
 * dependencies a request actually needs — database, object storage — and
 * reports a redacted provider-configuration summary.
 *
 * Returns 200 when the service is ready to serve (database reachable); 503
 * otherwise. Never returns secret values.
 */

import { prisma } from '@raivstream/database';
import { getProviderRegistry, summarizeProviderRegistry } from '@raivstream/api';

export const dynamic = 'force-dynamic';

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs: number | null }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: null };
  }
}

async function checkStorage(): Promise<{ configured: boolean; reachable: boolean | null }> {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl || !process.env.R2_BUCKET_NAME) {
    return { configured: false, reachable: null };
  }
  try {
    // Any HTTP response (incl. 404) means the endpoint is reachable.
    const res = await fetch(publicUrl, { method: 'HEAD' });
    return { configured: true, reachable: Boolean(res.status) };
  } catch {
    return { configured: true, reachable: false };
  }
}

export async function GET(): Promise<Response> {
  const _falDiag = { routeKeyLen: (process.env.FAL_KEY ?? '').length, enabled: process.env.FAL_MEDIA_PROVIDER_ENABLED };
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const providers = summarizeProviderRegistry(getProviderRegistry());

  const ready = database.status === 'ok';
  const body = {
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      database,
      storage,
    },
    providers,
    _falDiag,
  };

  return new Response(JSON.stringify(body), {
    status: ready ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
