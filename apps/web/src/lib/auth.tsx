'use client';

/**
 * Web authentication context — httpOnly cookie-based.
 *
 * Tokens live exclusively in httpOnly cookies set by /api/auth/* routes.
 * Nothing token-related touches localStorage or any JS-readable storage.
 * XSS attacks cannot steal tokens because httpOnly cookies are invisible to scripts.
 *
 * Flow:
 *   Login/Register → POST /api/auth/login|register → server sets raiv_at + raiv_rt cookies
 *   Auth check     → GET  /api/auth/me             → reads raiv_at cookie, returns user
 *   Token refresh  → POST /api/auth/refresh        → rotates raiv_at + raiv_rt cookies
 *   Logout         → POST /api/auth/logout         → server invalidates DB token, clears cookies
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface AuthUser {
  id:             string;
  email:          string;
  username:       string;
  displayName:    string;
  avatarUrl:      string | null;
  role:           string;
  premiumTier:    string;
  verified:       boolean;
  followerCount:  number;
  followingCount: number;
  totalViews:     number;
  totalLikes:     number;
}

interface AuthState {
  user:       AuthUser | null;
  isLoaded:   boolean;
  isSignedIn: boolean;
}

interface AuthContextValue extends AuthState {
  /** Called after a successful login/register API response with the returned user */
  setUser:  (user: AuthUser) => void;
  /** Invalidates the session server-side, clears all cookies */
  signOut:  (allDevices?: boolean) => Promise<void>;
  /** Silent token refresh — called automatically before expiry */
  refresh:  () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Refresh 2 min before the 15-min access token expires
const REFRESH_INTERVAL_MS = 13 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, isLoaded: false, isSignedIn: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((refreshFn: () => Promise<boolean>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const ok = await refreshFn();
      if (ok) scheduleRefresh(refreshFn);
    }, REFRESH_INTERVAL_MS);
  }, []);

  const performRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method:      'POST',
        credentials: 'same-origin', // sends raiv_rt httpOnly cookie automatically
      });
      if (!res.ok) {
        setState({ user: null, isLoaded: true, isSignedIn: false });
        return false;
      }
      const data = await res.json() as { user: AuthUser };
      if (data.user) setState({ user: data.user, isLoaded: true, isSignedIn: true });
      return true;
    } catch {
      return false;
    }
  }, []);

  // On mount: check /api/auth/me to restore session from cookie
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data: { user: AuthUser | null }) => {
        if (data.user) {
          setState({ user: data.user, isLoaded: true, isSignedIn: true });
          scheduleRefresh(performRefresh);
        } else {
          setState({ user: null, isLoaded: true, isSignedIn: false });
        }
      })
      .catch(() => setState({ user: null, isLoaded: true, isSignedIn: false }));

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleRefresh, performRefresh]);

  const setUser = useCallback((user: AuthUser) => {
    setState({ user, isLoaded: true, isSignedIn: true });
    scheduleRefresh(performRefresh);
  }, [scheduleRefresh, performRefresh]);

  const signOut = useCallback(async (allDevices = false) => {
    try {
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ allDevices }),
      });
    } catch { /* always clear state */ }
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ user: null, isLoaded: true, isSignedIn: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setUser, signOut, refresh: performRefresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** Drop-in for Clerk's useUser() */
export function useUser() {
  const { user, isLoaded, isSignedIn } = useAuth();
  return { user, isLoaded, isSignedIn };
}
