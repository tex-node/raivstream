import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

const { width: W } = Dimensions.get('window');
const THUMB_W = (W - 3) / 3; // 3-column grid

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn, user: authUser, clearSession } = useAuthStore();
  const logout = trpc.auth.logout.useMutation();

  const username = authUser?.username ?? '';
  const profile = trpc.user.getByUsername.useQuery(
    { username },
    { enabled: !!username }
  );

  const myVideos = trpc.video.myVideos.useQuery(
    { limit: 30 },
    { enabled: isSignedIn }
  );

  if (!isSignedIn) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Your Profile</Text>
        <Text style={styles.subtitle}>Sign in to see your profile and uploads</Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (profile.isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  const p = profile.data;
  const videos: Array<{ id: string; title: string; thumbnailUrl: string; status: string; viewCount: number; likeCount: number; avgStarRating: number; publishedAt: Date | null }> = myVideos.data?.videos ?? [];

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          const refreshToken = useAuthStore.getState().refreshToken;
          await logout.mutateAsync({ refreshToken: refreshToken ?? undefined }).catch(() => {});
          await clearSession();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{
            uri:
              p?.avatarUrl ??
              authUser?.avatarUrl ??
              `https://i.pravatar.cc/120?u=${username}`,
          }}
          style={styles.avatar}
          contentFit="cover"
        />
        <Text style={styles.displayName}>
          {p?.displayName ?? authUser?.displayName ?? username}
          {p?.verified ? ' ✓' : ''}
        </Text>
        <Text style={styles.username}>@{username}</Text>
        {p?.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatPill label="Videos" value={videos.length} />
          <StatPill label="Followers" value={p?.followerCount ?? 0} />
          <StatPill label="Following" value={p?.followingCount ?? 0} />
          <StatPill label="Views" value={p?.totalViews ?? 0} />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {p?.role !== 'CREATOR' && (
            <BecomeCreatorButton />
          )}
          <TouchableOpacity style={styles.outlineBtn} onPress={handleSignOut}>
            <Text style={styles.outlineBtnText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Video grid */}
      <Text style={styles.sectionTitle}>My Videos</Text>
      {myVideos.isLoading ? (
        <ActivityIndicator color="#ec4899" style={{ marginTop: 20 }} />
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No videos yet</Text>
          <TouchableOpacity
            style={[styles.signInBtn, { marginTop: 12 }]}
            onPress={() => router.push('/(tabs)/upload')}
          >
            <Text style={styles.signInBtnText}>Upload your first video</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.grid}>
          {videos.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.thumbWrap}
              onPress={() => router.push(`/video/${v.id}`)}
            >
              <Image
                source={{ uri: v.thumbnailUrl }}
                style={styles.thumbImg}
                contentFit="cover"
              />
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{v.status}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{fmtCount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BecomeCreatorButton() {
  const utils = trpc.useUtils();
  const become = trpc.user.becomeCreator.useMutation({
    onSuccess: () => utils.user.invalidate(),
  });
  return (
    <TouchableOpacity
      style={styles.primaryBtn}
      onPress={() => become.mutate()}
      disabled={become.isPending}
    >
      <Text style={styles.primaryBtnText}>
        {become.isPending ? 'Upgrading…' : 'Become a Creator'}
      </Text>
    </TouchableOpacity>
  );
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },

  header: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 24 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#ec4899',
    marginBottom: 12,
  },
  displayName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  username: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  bio: { color: '#d1d5db', fontSize: 13, textAlign: 'center', marginBottom: 12 },

  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
    marginTop: 4,
  },
  stat: { alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#9ca3af', fontSize: 11 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  outlineBtnText: { color: '#fff', fontSize: 14 },

  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#6b7280', fontSize: 14, marginBottom: 24 },
  signInBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 11,
  },
  signInBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  emptyText: { color: '#6b7280', fontSize: 15, marginTop: 24 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1.5,
    paddingHorizontal: 0,
  },
  thumbWrap: { width: THUMB_W, aspectRatio: 9 / 16 },
  thumbImg: { width: '100%', height: '100%' },
  statusBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statusText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
