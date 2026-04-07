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
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
          // Send httpOnly cookies automatically — no localStorage token injection
          fetch: (url, options) =>
            fetch(url, { ...options, credentials: 'same-origin' }),
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
