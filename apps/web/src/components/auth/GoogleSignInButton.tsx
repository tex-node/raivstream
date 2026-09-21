'use client';

/**
 * Official Google Identity Services sign-in button.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset. On credential,
 * POSTs the Google ID token to /api/auth/google, which verifies it server-side
 * and sets the same httpOnly cookies as password login.
 */

import { useEffect, useRef } from 'react';
import type { AuthUser } from '@/lib/auth';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export function GoogleSignInButton({
  mode,
  onSuccess,
  onError,
}: {
  mode: 'signin' | 'signup';
  onSuccess: (user: AuthUser) => void;
  onError: (message: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onSuccess, onError });
  callbacksRef.current = { onSuccess, onError };

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    const render = () => {
      if (cancelled || !container.isConnected) return;
      try {
        window.google?.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            void (async () => {
              try {
                const res = await fetch('/api/auth/google', {
                  method:      'POST',
                  credentials: 'same-origin',
                  headers:     { 'Content-Type': 'application/json' },
                  body:        JSON.stringify({ idToken: response.credential }),
                });
                const data = (await res.json()) as { user?: AuthUser; error?: string };
                if (!res.ok || !data.user) {
                  callbacksRef.current.onError(data.error ?? 'Google sign-in failed — please try again');
                  return;
                }
                callbacksRef.current.onSuccess(data.user);
              } catch {
                callbacksRef.current.onError('Network error — please check your connection');
              }
            })();
          },
        });
        window.google?.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          width: container.offsetWidth || 320,
        });
      } catch {
        callbacksRef.current.onError('Google sign-in failed to load — please try again');
      }
    };

    if (window.google?.accounts?.id) {
      render();
      return () => { cancelled = true; };
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        render();
      } else {
        existing.addEventListener('load', render, { once: true });
      }
      return () => { cancelled = true; };
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      render();
    };
    script.onerror = () => callbacksRef.current.onError('Google sign-in failed to load — please try again');
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, [clientId, mode]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div ref={containerRef} className="flex justify-center [&>div]:!w-full" />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'var(--noc-hairline)' }} />
        <span className="text-xs" style={{ color: 'var(--noc-t6)' }}>or</span>
        <div className="h-px flex-1" style={{ background: 'var(--noc-hairline)' }} />
      </div>
    </div>
  );
}
