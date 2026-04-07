/**
 * Environment variable validation — runs at module load time.
 *
 * If any required variable is missing the process crashes immediately with a
 * clear message rather than silently failing at runtime.
 *
 * Import this at the top of the Next.js root layout or tRPC handler so it
 * runs on every cold start before any request is served.
 */

const REQUIRED_VARS: { name: string; description: string }[] = [
  { name: 'DATABASE_URL',        description: 'PostgreSQL connection string' },
  { name: 'JWT_ACCESS_SECRET',   description: 'Access token signing secret (min 64 chars)' },
  { name: 'JWT_REFRESH_SECRET',  description: 'Refresh token signing secret (min 64 chars)' },
];

// Optional vars — warn but don't crash if missing (video upload won't work without R2)
const OPTIONAL_VARS: { name: string; description: string }[] = [
  { name: 'R2_ENDPOINT',         description: 'Cloudflare R2 endpoint URL' },
  { name: 'R2_ACCESS_KEY_ID',    description: 'Cloudflare R2 access key' },
  { name: 'R2_SECRET_ACCESS_KEY',description: 'Cloudflare R2 secret key' },
  { name: 'R2_BUCKET_NAME',      description: 'Cloudflare R2 bucket name' },
  { name: 'R2_PUBLIC_URL',       description: 'Cloudflare R2 public CDN base URL' },
];

const STRENGTH_CHECKS: { name: string; minLength: number }[] = [
  { name: 'JWT_ACCESS_SECRET',  minLength: 32 },
  { name: 'JWT_REFRESH_SECRET', minLength: 32 },
];

const FORBIDDEN_VALUES = [
  'secret', 'password', 'changeme', 'example', 'replace_me', 'your_secret_here',
  'jwt_secret', 'access_secret', 'refresh_secret',
];

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const errors: string[] = [];

  // Check required variables are set
  for (const { name, description } of REQUIRED_VARS) {
    if (!process.env[name]) {
      errors.push(`Missing required env var: ${name} (${description})`);
    }
  }

  // Check JWT secrets are not weak defaults
  for (const { name, minLength } of STRENGTH_CHECKS) {
    const value = process.env[name];
    if (!value) continue; // already caught above
    if (value.length < minLength) {
      errors.push(`${name} is too short (${value.length} chars, minimum ${minLength})`);
    }
    if (FORBIDDEN_VALUES.some((bad) => value.toLowerCase().includes(bad))) {
      errors.push(`${name} appears to be a weak default — generate a random secret`);
    }
  }

  // Warn (don't crash) for optional vars
  for (const { name, description } of OPTIONAL_VARS) {
    if (!process.env[name]) {
      console.warn(`[env] WARNING: ${name} not set — ${description} (video upload disabled)`);
    }
  }

  // Warn (don't crash) if Stripe keys are test keys in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      console.warn('[env] WARNING: Using Stripe test key in production');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.warn('[env] WARNING: STRIPE_WEBHOOK_SECRET not set — webhook verification disabled');
    }
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.warn('[env] WARNING: NEXT_PUBLIC_APP_URL not set — CORS origins may be misconfigured');
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:\n');
    errors.forEach((e) => console.error(`   • ${e}`));
    console.error('\nFix the above before starting the server.\n');
    process.exit(1);
  }
}

/** Whitelisted CORS origins built from env vars */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  // Always allow the configured app URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.add(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Vercel deployment URL
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  // Allow localhost in development
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:19006'); // Expo web
  }

  return [...origins];
}
