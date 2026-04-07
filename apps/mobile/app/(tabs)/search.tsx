import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trpc } from '@/lib/trpc';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - 36) / 2; // 2-column grid with padding

type SearchVideo = {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  duration?: number;
  creator: { username: string; displayName: string };
};

function VideoThumb({ item }: { item: SearchVideo }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={[styles.thumb, { width: CARD_W }]}
      onPress={() => router.push(`/video/${item.id}`)}
    >
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={styles.thumbImg}
        contentFit="cover"
      />
      <View style={styles.thumbOverlay}>
        <Text style={styles.thumbDuration}>{formatDuration(item.duration ?? 0)}</Text>
      </View>
      <Text style={styles.thumbTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.thumbCreator}>@{item.creator.username}</Text>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = trpc.video.search.useInfiniteQuery(
    { query: submitted, limit: 20 },
    {
      getNextPageParam: (p) => p.nextCursor,
      enabled: submitted.length > 0,
    }
  );

  const results: SearchVideo[] =
    (search.data?.pages.flatMap((p) => p.videos) ?? []) as SearchVideo[];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.input}
          placeholder="Search videos, creators, tags…"
          placeholderTextColor="#6b7280"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSubmitted(query.trim())}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => { setQuery(''); setSubmitted(''); }}
          >
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      {search.isLoading && submitted ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
        </View>
      ) : results.length === 0 && submitted ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No results for "{submitted}"</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hintText}>Search for videos, creators or tags</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <VideoThumb item={item} />}
          onEndReached={() => {
            if (search.hasNextPage && !search.isFetchingNextPage) {
              search.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            search.isFetchingNextPage ? (
              <ActivityIndicator color="#ec4899" style={styles.footer} />
            ) : null
          }
        />
      )}
    </View>
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15 },
  hintText: { color: '#4b5563', fontSize: 15 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { fontSize: 18, color: '#6b7280', marginRight: 8 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  clearBtn: { fontSize: 16, color: '#6b7280', paddingLeft: 8 },

  grid: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: 'space-between', marginBottom: 12 },

  thumb: { gap: 4 },
  thumbImg: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  thumbOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbDuration: { color: '#fff', fontSize: 11, fontWeight: '600' },
  thumbTitle: { color: '#fff', fontSize: 12, fontWeight: '500' },
  thumbCreator: { color: '#6b7280', fontSize: 11 },

  footer: { marginVertical: 16 },
});
