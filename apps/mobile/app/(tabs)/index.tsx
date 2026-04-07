import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

const { width: W, height: H } = Dimensions.get('window');

// ── Types ────────────────────────────────────────────────────────────────────

type FeedVideo = {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string;
  mp4Url: string | null;
  hlsMasterUrl: string | null;
  duration: number;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  avgStarRating: number;
  tags: string[];
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    verified: boolean;
  };
};

type FeedTab = 'forYou' | 'following' | 'trending';

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({
  item,
  isActive,
}: {
  item: FeedVideo;
  isActive: boolean;
}) {
  const router = useRouter();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const videoRef = useRef<Video>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likeCount);

  const videoUrl = item.mp4Url ?? item.hlsMasterUrl ?? null;

  const toggleLike = trpc.interaction.toggleLike.useMutation({
    onMutate: () => {
      // Optimistic update
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    },
  });

  const trackProgress = trpc.interaction.trackProgress.useMutation();

  const handleLike = () => {
    if (!isSignedIn) {
      router.push('/(auth)/sign-in');
      return;
    }
    toggleLike.mutate({ videoId: item.id });
  };

  return (
    <View style={[styles.card, { width: W, height: H }]}>
      {/* ── Video ── */}
      {videoUrl ? (
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping
          isMuted={false}
          onPlaybackStatusUpdate={(status) => {
            if (!status.isLoaded || !isSignedIn) return;
            if (status.positionMillis > 0 && status.positionMillis % 5000 < 200) {
              trackProgress.mutate({
                videoId: item.id,
                watchTimeSeconds: Math.floor(status.positionMillis / 1000),
                completed:
                  status.durationMillis != null &&
                  status.positionMillis / status.durationMillis >= 0.9,
                lastPosition: Math.floor(status.positionMillis / 1000),
              });
            }
          }}
        />
      ) : (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}

      {/* ── Dark gradient overlay ── */}
      <View style={styles.overlay} pointerEvents="none" />

      {/* ── Bottom info ── */}
      <View style={styles.bottomInfo}>
        <Pressable onPress={() => router.push(`/${item.creator.username}`)}>
          <Text style={styles.creatorName}>
            @{item.creator.username}
            {item.creator.verified ? ' ✓' : ''}
          </Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.tagsRow}>
          {item.tags.slice(0, 3).map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      </View>

      {/* ── Right sidebar ── */}
      <View style={styles.sidebar}>
        {/* Avatar */}
        <Pressable
          onPress={() => router.push(`/${item.creator.username}`)}
          style={styles.avatarWrap}
        >
          <Image
            source={{
              uri:
                item.creator.avatarUrl ??
                `https://i.pravatar.cc/60?u=${item.creator.username}`,
            }}
            style={styles.avatar}
            contentFit="cover"
          />
        </Pressable>

        {/* Like */}
        <TouchableOpacity style={styles.sideBtn} onPress={handleLike}>
          <Text style={[styles.sideBtnIcon, liked && styles.sideBtnActive]}>
            {liked ? '♥' : '♡'}
          </Text>
          <Text style={styles.sideBtnLabel}>{fmtCount(likeCount)}</Text>
        </TouchableOpacity>

        {/* Views */}
        <View style={styles.sideBtn}>
          <Text style={styles.sideBtnIcon}>👁</Text>
          <Text style={styles.sideBtnLabel}>{fmtCount(item.viewCount)}</Text>
        </View>

        {/* Stars */}
        <View style={styles.sideBtn}>
          <Text style={styles.sideBtnIcon}>⭐</Text>
          <Text style={styles.sideBtnLabel}>
            {item.avgStarRating > 0 ? item.avgStarRating.toFixed(1) : '—'}
          </Text>
        </View>

        {/* Share */}
        <TouchableOpacity
          style={styles.sideBtn}
          onPress={() => router.push(`/video/${item.id}`)}
        >
          <Text style={styles.sideBtnIcon}>↗</Text>
          <Text style={styles.sideBtnLabel}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Feed tabs ─────────────────────────────────────────────────────────────────

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'forYou', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'trending', label: 'Trending' },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<FeedTab>('forYou');
  const [activeIndex, setActiveIndex] = useState(0);

  // Fetch the active tab's feed
  const forYou = trpc.feed.forYou.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (p) => p.nextCursor, enabled: activeTab === 'forYou' }
  );
  const following = trpc.feed.following.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (p) => p.nextCursor, enabled: activeTab === 'following' }
  );
  const trending = trpc.feed.trending.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (p) => p.nextCursor, enabled: activeTab === 'trending' }
  );

  const queries = { forYou, following, trending };
  const active = queries[activeTab];
  const videos: FeedVideo[] = (active.data?.pages.flatMap((p) => p.videos) ?? []) as FeedVideo[];

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
    },
    []
  );

  const handleEndReached = () => {
    if (active.hasNextPage && !active.isFetchingNextPage) {
      active.fetchNextPage();
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: FeedVideo; index: number }) => (
      <VideoCard item={item} isActive={index === activeIndex} />
    ),
    [activeIndex]
  );

  return (
    <View style={styles.screen}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { top: insets.top + 8 }]}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={styles.tab}
            onPress={() => setActiveTab(key)}
          >
            <Text
              style={[styles.tabLabel, activeTab === key && styles.tabLabelActive]}
            >
              {label}
            </Text>
            {activeTab === key && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Feed */}
      {active.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" size="large" />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No videos yet</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={H}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          getItemLayout={(_, index) => ({
            length: H,
            offset: H * index,
            index,
          })}
          ListFooterComponent={
            active.isFetchingNextPage ? (
              <ActivityIndicator
                color="#ec4899"
                style={{ height: H, justifyContent: 'center' } as any}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },

  // Tab bar
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  tab: { alignItems: 'center', paddingHorizontal: 4 },
  tabLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  tabUnderline: {
    marginTop: 2,
    height: 2,
    width: '100%',
    backgroundColor: '#ec4899',
    borderRadius: 1,
  },

  // Card
  card: { position: 'relative', backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // Gradient simulation via dark bottom strip
    top: '50%',
  },

  // Bottom info
  bottomInfo: {
    position: 'absolute',
    bottom: 80,
    left: 12,
    right: 72,
  },
  creatorName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  description: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 6,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  // Sidebar
  sidebar: {
    position: 'absolute',
    right: 8,
    bottom: 80,
    alignItems: 'center',
    gap: 20,
  },
  avatarWrap: { marginBottom: 4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  sideBtn: { alignItems: 'center' },
  sideBtnIcon: { fontSize: 26, color: '#fff' },
  sideBtnActive: { color: '#ec4899' },
  sideBtnLabel: { color: '#fff', fontSize: 11, marginTop: 2 },
});
