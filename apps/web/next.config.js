/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@raivstream/api'],

  // Atomic deploys: CI builds into a staging dir (NEXT_BUILD_DIST_DIR=.next-build)
  // while the running server keeps serving the previous .next, then swaps at the
  // end — no chunk-400 window for in-flight clients. Runtime (next start, no env)
  // defaults to '.next'.
  distDir: process.env.NEXT_BUILD_DIST_DIR ?? '.next',

  // Keep database + Prisma as server-only externals so webpack never bundles them.
  // This ensures a single PrismaClient singleton and allows the native engine
  // binary to be loaded correctly at runtime.
  serverExternalPackages: [
    '@raivstream/database',
    '@prisma/client',
    '@prisma/engines',
  ],

  // Include the Prisma query engine .dll for Windows deployments
  outputFileTracingIncludes: {
    '/api/trpc/[trpc]': [
      '../../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/**',
    ],
  },

  // Clerk: tell Next.js where the custom auth pages live.
  // These must also be set as env vars on Vercel / in .env.local.
  env: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/sign-up',
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: '/',
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: '/',
  },

  images: {
    remotePatterns: [
      // ── Cloudflare R2 direct bucket URL (dev / fallback) ──────────────────
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      // ── R2 custom domain (production CDN) ─────────────────────────────────
      // Update this to match your actual R2_PUBLIC_URL domain, e.g.
      //   media.raivstream.com
      // Using a wildcard so the same build works across staging + production:
      { protocol: 'https', hostname: '**.raivstream.com' },
      // ── Clerk avatar images ───────────────────────────────────────────────
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'images.clerk.dev' },
    ],
  },

  experimental: {
    serverActions: {
      // Increase body limit so large tRPC batch calls don't get rejected
      bodySizeLimit: '50mb',
    },
  },

  // Mobile UI handoff canonical activation: /m/** was the first landing
  // spot for the design-handoff screens (codex/ui-mobile-handoff-production,
  // be8f8a4) but was never linked from ordinary navigation. The same
  // screens are now rendered directly from the canonical /story-playground
  // route tree (see components/mobile-handoff/*), so /m/** becomes a
  // permanent (308) redirect rather than a second, separately-maintained
  // implementation — Section 6, option B. Deep links keep working.
  async redirects() {
    return [
      { source: '/m', destination: '/story-playground', permanent: true },
      { source: '/m/:projectId', destination: '/story-playground/:projectId', permanent: true },
      { source: '/m/:projectId/story', destination: '/story-playground/:projectId/story', permanent: true },
      { source: '/m/:projectId/cast', destination: '/story-playground/:projectId/characters', permanent: true },
      { source: '/m/:projectId/cast/:characterId', destination: '/story-playground/:projectId/characters/:characterId', permanent: true },
      { source: '/m/:projectId/scenes', destination: '/story-playground/:projectId/scenes', permanent: true },
      { source: '/m/:projectId/scenes/:sceneId', destination: '/story-playground/:projectId/scenes/:sceneId', permanent: true },
      { source: '/m/:projectId/assets', destination: '/story-playground/:projectId/assets', permanent: true },

      // The canonical route itself is named "characters" (matching the
      // app's own pre-existing ?tab=characters convention) rather than
      // "cast" (the /m-era name, kept above only as an /m/** redirect
      // source). Alias the intuitive "cast" spelling on the canonical tree
      // too, since a bare 404 for a name this codebase used everywhere
      // else this same release is a real defect, not just an /m artifact.
      { source: '/story-playground/:projectId/cast', destination: '/story-playground/:projectId/characters', permanent: true },
      { source: '/story-playground/:projectId/cast/:characterId', destination: '/story-playground/:projectId/characters/:characterId', permanent: true },
    ];
  },
};

module.exports = nextConfig;
