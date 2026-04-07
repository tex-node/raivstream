/**
 * GET /api/health
 *
 * Public health check endpoint.
 * Returns 200 when the app + database are healthy.
 * Returns 503 if the database is unreachable.
 *
 * Used by:
 *   - Uptime monitors (UptimeRobot, Checkly, etc.)
 *   - Load balancers
 *   - Kubernetes readiness probes
 *   - RunPod health checks
 */

import { prisma } from '@raivstream/database';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const start = Date.now();

  let dbStatus: 'ok' | 'error' = 'error';
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbStatus    = 'ok';
  } catch (err) {
    dbError = process.env.NODE_ENV === 'development'
      ? String(err)
      : 'Database unreachable';
  }

  const healthy = dbStatus === 'ok';
  const body = {
    status:    healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version ?? 'unknown',
    uptime:    process.uptime(),
    services: {
      database: {
        status:    dbStatus,
        latencyMs: dbLatencyMs,
        ...(dbError ? { error: dbError } : {}),
      },
    },
  };

  return new Response(JSON.stringify(body), {
    status:  healthy ? 200 : 503,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
