/**
 * Generic secure storage helpers.
 * The auth store (lib/auth.ts) manages JWT tokens directly via expo-secure-store.
 */
import * as SecureStore from 'expo-secure-store';

export async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore write errors on emulator
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
