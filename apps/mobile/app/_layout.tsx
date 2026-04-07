import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TRPCProvider } from '@/components/providers/TRPCProvider';
import { useAuthStore } from '@/lib/auth';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isLoaded, isSignedIn, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  // Restore persisted session from SecureStore on app launch
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <TRPCProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="video/[id]" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthGate>
      </GestureHandlerRootView>
    </TRPCProvider>
  );
}
