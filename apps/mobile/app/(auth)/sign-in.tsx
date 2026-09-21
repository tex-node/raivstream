import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/lib/auth';

// Completes the in-app-browser redirect back into the app (required on native).
WebBrowser.maybeCompleteAuthSession();

// Google OAuth client IDs — the server accepts all of these as token audience.
// NOTE: requires a development build (`eas build --profile development`);
// Expo Go cannot complete this flow (auth proxy removed in SDK 50+).
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setSession } = useAuthStore();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  const login = trpc.auth.login.useMutation({
    onSuccess: async ({ user, accessToken, refreshToken }) => {
      await setSession(user, accessToken, refreshToken);
      router.replace('/(tabs)');
    },
    onError: (err) => Alert.alert('Sign in failed', err.message),
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: async ({ user, accessToken, refreshToken }) => {
      await setSession(user, accessToken, refreshToken);
      router.replace('/(tabs)');
    },
    onError: (err) => Alert.alert('Registration failed', err.message),
  });

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  const googleLogin = trpc.auth.google.useMutation({
    onSuccess: async ({ user, accessToken, refreshToken }) => {
      await setSession(user, accessToken, refreshToken);
      router.replace('/(tabs)');
    },
    onError: (err) => Alert.alert('Google sign-in failed', err.message),
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token as string | undefined;
      if (idToken) {
        googleLogin.mutate({ idToken });
      } else {
        Alert.alert('Google sign-in failed', 'No credential was returned');
      }
    } else if (googleResponse?.type === 'error') {
      Alert.alert('Google sign-in failed', googleResponse.error?.message ?? 'Unknown error');
    }
    // 'dismiss' (user cancelled) is intentionally silent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const loading = login.isPending || register.isPending || googleLogin.isPending;

  const handleSubmit = () => {
    if (mode === 'sign-in') {
      login.mutate({ email, password });
    } else {
      register.mutate({
        email,
        password,
        username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        displayName: displayName || username,
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.logo}>Raivstream</Text>
        <Text style={styles.tagline}>Premium short-form video</Text>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          {(['sign-in', 'sign-up'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'sign-in' ? 'Sign In' : 'Create Account'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'sign-up' && (
          <>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="Username"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        )}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        {GOOGLE_WEB_CLIENT_ID ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <TouchableOpacity
              style={[styles.googleBtn, (!googleRequest || googleLogin.isPending) && styles.googleBtnDisabled]}
              onPress={() => void googlePromptAsync()}
              disabled={!googleRequest || googleLogin.isPending}
            >
              {googleLogin.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.googleBtnText}>
                  <Text style={styles.googleG}>G</Text>
                  {'  '}Continue with Google
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.skipBtnText}>Browse without signing in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'stretch',
  },

  logo: {
    color: '#ec4899',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  tagline: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 3,
    marginBottom: 24,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#ec4899' },
  modeBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  modeBtnTextActive: { color: '#fff' },

  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
  },

  primaryBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  dividerText: { color: '#6b7280', fontSize: 13 },

  googleBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  googleBtnDisabled: { opacity: 0.5 },
  googleBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  googleG: { color: '#4285F4', fontWeight: '900' },

  skipBtn: { marginTop: 20, alignItems: 'center' },
  skipBtnText: { color: '#6b7280', fontSize: 13 },
});
