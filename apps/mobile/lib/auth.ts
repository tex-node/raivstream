import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'raiv_access_token';
const REFRESH_TOKEN_KEY = 'raiv_refresh_token';
const USER_KEY = 'raiv_user';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  premiumTier: string;
  verified: boolean;
  followerCount: number;
  followingCount: number;
  totalViews: number;
  totalLikes: number;
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;

  hydrate: () => Promise<void>;
  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  clearSession: () => Promise<void>;
  getToken: () => string | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoaded: false,
  isSignedIn: false,

  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (accessToken && userJson) {
        const user = JSON.parse(userJson) as AuthUser;
        set({ user, accessToken, refreshToken, isLoaded: true, isSignedIn: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setSession: async (user, accessToken, refreshToken) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, accessToken, refreshToken, isLoaded: true, isSignedIn: true });
  },

  clearSession: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    set({ user: null, accessToken: null, refreshToken: null, isSignedIn: false });
  },

  getToken: () => get().accessToken,
}));
