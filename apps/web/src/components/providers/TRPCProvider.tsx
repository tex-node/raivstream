'use client';

/**
 * tRPC + React Query provider.
 *
 * Tokens live in httpOnly cookies — the browser sends them automatically on every
 * same-origin request via `credentials: 'same-origin'`. No manual Authorization
 * header injection needed or safe for web clients.
 *
 * Mobile clients use their own tRPC client (apps/mobile/lib/trpc.ts) which sends
 * Authorization: Bearer <token> from SecureStore.
 *
 * SESSION EXPIRY: a 401 first tries a silent refresh. If that fails the session
 * is genuinely gone, so we clear the client and send the user to sign-in instead
 * of letting every screen render its own "Not authenticated" text. That failure
 * mode is how a user ended up staring at a dead Generate button with no way
 * forward except a manual reload.
 */

import { useState, useRef } from 'react';
import { QueryClient, QueryCache, MutationCache, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Where to send a user whose session is gone. */
function redirectToSignIn(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  // Never bounce the auth pages onto themselves - that is an infinite loop.
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return;

  const returnUrl = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`/sign-in?returnUrl=${returnUrl}`);
}

/**
 * React Query surfaces errors that never went through our fetch wrapper (cached
 * failures, retries). Catch UNAUTHORIZED here too so no caller has to.
 */
function handleUnauthorized(error: unknown): void {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code === 'UNAUTHORIZED') redirectToSignIn();
}


/**
 * Balance invalidation for every spending mutation (2026-11-11).
 *
 * THE READ. No mutation invalidated `user.creditBalance` anywhere: /generate refetched by hand and
 * `CreditBalancePill` compensated with focus-refetch and a 30 s interval. Fifteen spending sites
 * exist on the server (chargeOrThrow in the take and production paths, deductCredits across
 * generation, story, audio and director, plus admin adjustments) and nineteen client call sites -
 * so a per-call-site fix is a fix with nineteen places to forget, and every future caller adds a
 * twentieth.
 *
 * THE SHAPE. One `MutationCache.onSuccess`, keyed by the mutation path. It cannot be bypassed by a
 * future caller because it is not at a caller. This is deliberately NOT a per-site one-liner: the
 * arc's half-boundary defect is a guard that covers the paths someone remembered.
 *
 * BACKGROUND CHARGES are not covered and cannot be: a server-side run (production, movie render)
 * charges without a client mutation, so the client learns by poll or focus. The pill's interval stays
 * for exactly that reason.
 */
const SPENDING_MUTATIONS = [
  'generation.create',
  'generation.publish',
  'story.generateStory',
  'story.continueStory',
  'story.generateScenes',
  'story.generateSceneImage',
  'story.regenerateSceneImage',
  'story.generateSceneShotClips',
  'story.generateStoryNarration',
  'director.compose',
  'creative.project.auto',
  'creative.production.run',
  'creative.director.regenerateShot',
  'admin.adjustCredits',
] as const;

function mutationPath(mutation: { options: { mutationKey?: readonly unknown[] } }): string {
  const key = mutation.options.mutationKey ?? [];
  return key.map((part) => String(part)).join('.');
}

export function spendsCredits(mutation: { options: { mutationKey?: readonly unknown[] } }): boolean {
  const path = mutationPath(mutation);
  if (!path) return false;
  return SPENDING_MUTATIONS.some((spend) => path === spend || path.startsWith(`${spend}.`));
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClientRef = useRef<QueryClient | null>(null);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleUnauthorized }),
        mutationCache: new MutationCache({
          onError: handleUnauthorized,
          // A charge resolved: refresh the balance so the header cannot show a stale number.
          onSuccess: (_data, _vars, _ctx, mutation) => {
            if (spendsCredits(mutation as never)) {
              void queryClientRef.current?.invalidateQueries({ queryKey: [['user', 'creditBalance']] });
            }
          },
        }),
        defaultOptions: {
          queries:   { staleTime: 60_000, retry: 1 },
          mutations: { retry: 0 },
        },
      })
  );

  queryClientRef.current = queryClient;

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url:         `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          // On 401, silently refresh the access token and retry once. If the
          // refresh itself fails the session is over: redirect rather than
          // propagating a raw "Not authenticated" to every caller.
          fetch: async (url, options) => {
            const res = await fetch(url, { ...options, credentials: 'same-origin' });
            if (res.status === 401) {
              const refreshed = await fetch('/api/auth/refresh', {
                method:      'POST',
                credentials: 'same-origin',
              });
              if (refreshed.ok) {
                // Cookie is now rotated — retry the original request
                return fetch(url, { ...options, credentials: 'same-origin' });
              }
              redirectToSignIn();
            }
            return res;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
