/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@raivstream/api'],

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
};

module.exports = nextConfig;
