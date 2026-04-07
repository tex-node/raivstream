import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trpc } from '@/lib/trpc';

const { width: W } = Dimensions.get('window');

export default function VideoModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: video, isLoading } = trpc.video.getById.useQuery({ id: id ?? '' }, { enabled: !!id });

  const handleShare = async () => {
    if (!video) return;
    try {
      await Share.share({
        message: `Watch "${video.title}" on Raivstream`,
        url: `https://raivstream.com/v/${video.id}`,
      });
    } catch { /* ignored */ }
  };

  const videoUrl = video?.mp4Url ?? video?.hlsMasterUrl ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" size="large" />
        </View>
      ) : !video ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Video not found</Text>
        </View>
      ) : (
        <ScrollView>
          {/* Player */}
          {videoUrl ? (
            <Video
              source={{ uri: videoUrl }}
              style={styles.player}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              useNativeControls
            />
          ) : (
            <Image
              source={{ uri: video.thumbnailUrl }}
              style={styles.player}
              contentFit="contain"
            />
          )}

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.title}>{video.title}</Text>

            {/* Creator row */}
            <TouchableOpacity
              style={styles.creatorRow}
              onPress={() => router.push(`/${video.creator.username}`)}
            >
              <Image
                source={{
                  uri:
                    video.creator.avatarUrl ??
                    `https://i.pravatar.cc/40?u=${video.creator.username}`,
                }}
                style={styles.creatorAvatar}
                contentFit="cover"
              />
              <View>
                <Text style={styles.creatorName}>
                  {video.creator.displayName}
                  {video.creator.verified ? ' ✓' : ''}
                </Text>
                <Text style={styles.creatorUsername}>@{video.creator.username}</Text>
              </View>
            </TouchableOpacity>

            {/* Stats */}
            <View style={styles.statsRow}>
              <Stat icon="👁" value={fmtCount(video.viewCount)} label="views" />
              <Stat icon="♥" value={fmtCount(video.likeCount)} label="likes" />
              <Stat icon="⭐" value={video.avgStarRating.toFixed(1)} label="rating" />
            </View>

            {/* Description */}
            {video.description ? (
              <Text style={styles.description}>{video.description}</Text>
            ) : null}

            {/* Tags */}
            {video.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {video.tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>#{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Share button */}
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>↗  Share</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#6b7280', fontSize: 16 },

  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  player: { width: W, aspectRatio: 9 / 16, backgroundColor: '#111' },

  info: { padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  creatorAvatar: { width: 40, height: 40, borderRadius: 20 },
  creatorName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  creatorUsername: { color: '#9ca3af', fontSize: 12 },

  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 14 },
  stat: { alignItems: 'center' },
  statIcon: { fontSize: 18 },
  statValue: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statLabel: { color: '#9ca3af', fontSize: 11 },

  description: { color: '#d1d5db', fontSize: 13, lineHeight: 20, marginBottom: 12 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: {
    backgroundColor: 'rgba(236,72,153,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: '#ec4899', fontSize: 12 },

  shareBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
