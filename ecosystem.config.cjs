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
    },
    {
      name: 'raivstream-worker',
      cwd: './packages/api',
      script: 'pnpm',
      args: 'run worker',
      env_file: '../../.env',
      max_restarts: 5,
      restart_delay: 5000,
    },
  ],
};
