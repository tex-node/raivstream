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
      // The 5.0 chain is declared here for the same reason FILMS_ENABLED is:
      // pm2 does not read env_file, so a flag that only lives in .env.local is
      // invisible to this process. Studio, series and audio are deliberately absent
      // - they are off, and their absence is the state.
      env: {
        FILMS_ENABLED: process.env.FILMS_ENABLED || 'true',
        RAIVSTREAM_5_ENABLED: 'true',
        RAIVSTREAM_5_CREATE_ENABLED: 'true',
        RAIVSTREAM_5_INTENT_ENABLED: 'true',
        RAIVSTREAM_5_BIBLE_ENABLED: 'true',
        RAIVSTREAM_5_PREVIEW_ENABLED: 'true',
        RAIVSTREAM_5_PRODUCTION_ENABLED: 'true',
        RAIVSTREAM_5_DIRECTOR_ENABLED: 'true',
        RAIVSTREAM_5_REVIEW_ENABLED: 'true',
        RAIVSTREAM_5_APPROVAL_ENABLED: 'true',
        RAIVSTREAM_5_OUTPUT_ENABLED: 'true',
        // Deliberately OFF. Declared false rather than omitted: the deploy
        // workflow sources .env.local before pm2 start, so an omitted flag can
        // still arrive from there - which is how studio and series were live.
        RAIVSTREAM_5_STUDIO_ENABLED: 'false',
        RAIVSTREAM_5_SERIES_ENABLED: 'false',
        RAIVSTREAM_5_AUDIO_ENABLED: 'false'
      },
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=900',
    },
    {
      name: 'raivstream-worker',
      cwd: './packages/api',
      script: 'pnpm',
      args: 'run worker',
      env_file: '../../.env',
      env: {
        FILMS_ENABLED: process.env.FILMS_ENABLED || 'true',
        RAIVSTREAM_5_ENABLED: 'true',
        RAIVSTREAM_5_CREATE_ENABLED: 'true',
        RAIVSTREAM_5_INTENT_ENABLED: 'true',
        RAIVSTREAM_5_BIBLE_ENABLED: 'true',
        RAIVSTREAM_5_PREVIEW_ENABLED: 'true',
        RAIVSTREAM_5_PRODUCTION_ENABLED: 'true',
        RAIVSTREAM_5_DIRECTOR_ENABLED: 'true',
        RAIVSTREAM_5_REVIEW_ENABLED: 'true',
        RAIVSTREAM_5_APPROVAL_ENABLED: 'true',
        RAIVSTREAM_5_OUTPUT_ENABLED: 'true',
        // Deliberately OFF. Declared false rather than omitted: the deploy
        // workflow sources .env.local before pm2 start, so an omitted flag can
        // still arrive from there - which is how studio and series were live.
        RAIVSTREAM_5_STUDIO_ENABLED: 'false',
        RAIVSTREAM_5_SERIES_ENABLED: 'false',
        RAIVSTREAM_5_AUDIO_ENABLED: 'false'
      },
      max_restarts: 5,
      restart_delay: 5000,
      // More headroom than web: FFmpeg children are not V8 heap, but this Node
      // process balloons while assembling large exports.
      max_memory_restart: '3G',
      node_args: '--max-old-space-size=2800',
    },
      {
      // The creative production worker (2026-11-18). It processes one run at a time from its own process, with its own provider budget.
      // The deploy starts it once and never reloads it (`--only` in deploy.yml), so an in-flight run keeps its queue slot and its
      // liveness stamp. A reload is not free: the SIGKILL test left the job `active` in pg-boss until its 900 s expiry with no
      // redelivery, and orphaned the FFmpeg children still rendering into /tmp.
      name: 'raivstream-creative-worker',
      cwd: __dirname,
      script: './node_modules/.bin/tsx',
      args: 'scripts/creative-worker.ts',
      interpreter: 'none',
      env_file: './.env',
      max_memory_restart: '600M',
      autorestart: true,
      restart_delay: 5000,
    },
],
};
