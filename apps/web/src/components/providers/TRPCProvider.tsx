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

import { useState } from 'react';
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

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleUnauthorized }),
        mutationCache: new MutationCache({ onError: handleUnauthorized }),
        defaultOptions: {
          queries:   { staleTime: 60_000, retry: 1 },
          mutations: { retry: 0 },
        },
      })
  );

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
