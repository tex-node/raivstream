/**
 * PM2 process definitions (D-033).
 *
 * `raivstream-web` reproduces the previous invocation exactly (the deploy
 * workflow keeps sourcing apps/web/.env.local before reload). `raivstream-worker`
 * runs the export queue in its own process so a runaway FFmpeg render cannot
 * block the web event loop.
 *
 * The worker's env comes from the root `.env` — which is where DATABASE_URL
 * lives. That root file is for CLI/cron/worker processes; the web app reads
 * apps/web/.env.local (D-054).
 */
module.exports = {
  apps: [
    {
      name: 'raivstream-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      // Hard ceiling on the shared box: max_memory_restart is PM2's kill/restart
      // trigger, node_args is the real cap that makes V8 GC instead of growing
      // until the kernel OOM killer picks a victim - possibly Postgres or Caddy.
      // Durable across deploys: pm2 does not read env_file, so a flag exported by
      // hand dies on the next restart. Declaring it here is what makes the surface
      // survive a deploy instead of silently switching itself off.
      env: { FILMS_ENABLED: process.env.FILMS_ENABLED || 'true' },
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=900',
    },
    {
      name: 'raivstream-worker',
      cwd: './packages/api',
      script: 'pnpm',
      args: 'run worker',
      env_file: '../../.env',
      env: { FILMS_ENABLED: process.env.FILMS_ENABLED || 'true' },
      max_restarts: 5,
      restart_delay: 5000,
      // More headroom than web: FFmpeg children are not V8 heap, but this Node
      // process balloons while assembling large exports.
      max_memory_restart: '3G',
      node_args: '--max-old-space-size=2800',
    },
  ],
};
