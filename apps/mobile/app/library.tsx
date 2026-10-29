/**
 * Mobile "My Media" screen - the app-side mirror of web `/library`.
 *
 * Reachable from Profile rather than a 7th tab: six tabs already crowd the
 * bottom bar, and media is a browse-later destination, not a primary one.
 *
 * Same data source as web (`library.getAssets`, paginated by cursor), so the two
 * surfaces cannot disagree about what a user owns.
 */

import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { trpc } from '../lib/trpc';

type Asset = {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  title: string;
  createdAt: string | Date;
  source: string;
};

const SOURCE_LABEL: Record<string, string> = {
  story: 'Story',
  studio: 'Studio',
  upload: 'Upload',
  generated: 'Generated',
  export: 'Final Export',
};

export default function LibraryScreen() {
  const router = useRouter();

  const query = trpc.library.getAssets.useInfiniteQuery(
    { limit: 30 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );

  const items = (query.data?.pages.flatMap((page) => page.items) ?? []) as Asset[];

  const renderItem = useCallback(({ item }: { item: Asset }) => {
    const isExport = item.source === 'export';
    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (item.type === 'video') router.push(`/video/library-${item.id}` as never);
        }}
      >
        <View style={styles.thumbWrap}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Text style={styles.fallbackGlyph}>{item.type === 'audio' ? '♪' : item.type === 'video' ? '▶' : '▦'}</Text>
            </View>
          )}
          {isExport && (
            <View style={styles.exportBadge}>
              <Text style={styles.exportBadgeText}>Final Export</Text>
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.meta}>{SOURCE_LABEL[item.source] ?? item.source}</Text>
      </Pressable>
    );
  }, [router]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>My Media</Text>
        <Text style={styles.count}>{items.length} items</Text>
      </View>

      {query.isLoading ? (
        <ActivityIndicator style={styles.spinner} color="#b25ad9" />
      ) : query.error ? (
        <Text style={styles.error}>{query.error.message}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nothing here yet. Generate a scene or export a story.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator style={styles.footerSpinner} color="#b25ad9" /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#05070f' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heading: { color: '#f4f4f7', fontSize: 22, fontWeight: '800' },
  count: { color: '#7b8296', fontSize: 12 },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { gap: 10 },
  card: { flex: 1, marginBottom: 14 },
  thumbWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: 1, backgroundColor: '#12151f' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackGlyph: { color: '#7b8296', fontSize: 26 },
  exportBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(139,92,246,0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  exportBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  title: { color: '#e6e7ee', fontSize: 12, fontWeight: '700', marginTop: 6 },
  meta: { color: '#7b8296', fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  spinner: { marginTop: 40 },
  footerSpinner: { marginVertical: 16 },
  empty: { color: '#7b8296', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  error: { color: '#f87171', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
