import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/lib/auth';
import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';

type Step = 'select' | 'uploading' | 'metadata' | 'done';

export default function UploadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);

  const [step, setStep] = useState<Step>('select');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isPremiumOnly, setIsPremiumOnly] = useState(false);

  const requestUpload = trpc.video.requestUpload.useMutation();
  const confirmUpload = trpc.video.confirmUpload.useMutation();
  const updateMetadata = trpc.video.updateMetadata.useMutation({
    onSuccess: () => setStep('done'),
  });

  if (!isSignedIn) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.heading}>Upload a Video</Text>
        <Text style={styles.subtitle}>You must be signed in to upload</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setVideoUri(asset.uri);
    setError(null);
    await startUpload(asset);
  };

  const startUpload = async (asset: ImagePicker.ImagePickerAsset) => {
    setStep('uploading');
    setProgress(0);

    try {
      // Derive content type from file extension
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'mp4';
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        webm: 'video/webm',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
      };
      const contentType = mimeMap[ext] ?? 'video/mp4';
      const fileSize = asset.fileSize ?? 10 * 1024 * 1024; // fallback 10 MB

      // 1. Get presigned PUT URL
      const { videoId: vid, uploadUrl } = await requestUpload.mutateAsync({
        filename: `video.${ext}`,
        contentType,
        fileSizeBytes: fileSize,
      });
      setVideoId(vid);

      // 2. Upload via XMLHttpRequest for progress tracking.
      //    React Native's fetch doesn't expose upload progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send({ uri: asset.uri, type: contentType, name: `video.${ext}` } as unknown as Blob);
      });

      // 3. Confirm
      await confirmUpload.mutateAsync({ videoId: vid, mode: 'mvp' });
      setStep('metadata');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStep('select');
    }
  };

  const submitMetadata = async () => {
    if (!videoId) return;
    await updateMetadata.mutateAsync({
      videoId,
      title: title.trim() || 'Untitled',
      description: description.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      isPublic,
      isPremiumOnly,
    });
  };

  const reset = () => {
    setStep('select');
    setVideoUri(null);
    setVideoId(null);
    setProgress(0);
    setError(null);
    setTitle('');
    setDescription('');
    setTags('');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Upload Video</Text>

      {/* ── Select ── */}
      {step === 'select' && (
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={styles.dropzone} onPress={pickVideo}>
            <Text style={styles.dropzoneIcon}>📹</Text>
            <Text style={styles.dropzoneLabel}>Tap to pick a video</Text>
            <Text style={styles.dropzoneHint}>MP4 · MOV · WebM · max 500 MB · 9:16 preferred</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Uploading ── */}
      {step === 'uploading' && (
        <View style={styles.center}>
          {videoUri && (
            <Video
              source={{ uri: videoUri }}
              style={styles.preview}
              resizeMode={ResizeMode.COVER}
              isMuted
            />
          )}
          <Text style={styles.progressLabel}>
            {progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      )}

      {/* ── Metadata ── */}
      {step === 'metadata' && (
        <>
          {videoUri && (
            <Video
              source={{ uri: videoUri }}
              style={styles.preview}
              resizeMode={ResizeMode.COVER}
              isMuted
            />
          )}

          <Label>Title *</Label>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Give your video a title"
            placeholderTextColor="#6b7280"
            maxLength={100}
          />

          <Label>Description</Label>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell viewers about your video…"
            placeholderTextColor="#6b7280"
            maxLength={500}
            multiline
            numberOfLines={3}
          />

          <Label>Tags (comma-separated)</Label>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="dance, tutorial, funny"
            placeholderTextColor="#6b7280"
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Public</Text>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ true: '#ec4899' }}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Premium only</Text>
            <Switch
              value={isPremiumOnly}
              onValueChange={setIsPremiumOnly}
              trackColor={{ true: '#ec4899' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 24 }]}
            onPress={submitMetadata}
            disabled={updateMetadata.isPending}
          >
            {updateMetadata.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Publish Video</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <View style={styles.center}>
          <Text style={styles.doneIcon}>✅</Text>
          <Text style={styles.doneTitle}>Video Published!</Text>
          <Text style={styles.doneSubtitle}>Your video is live and ready to watch.</Text>
          <View style={styles.doneActions}>
            <TouchableOpacity style={styles.outlineBtn} onPress={reset}>
              <Text style={styles.outlineBtnText}>Upload another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/(tabs)')}
            >
              <Text style={styles.primaryBtnText}>Go to Feed</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  center: { alignItems: 'center' },

  heading: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 24 },
  subtitle: { color: '#6b7280', fontSize: 14, marginBottom: 24 },
  error: {
    color: '#f87171',
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 13,
  },

  dropzone: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  dropzoneIcon: { fontSize: 48 },
  dropzoneLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dropzoneHint: { color: '#6b7280', fontSize: 12, textAlign: 'center' },

  preview: {
    width: 160,
    height: 284,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#111',
  },
  progressLabel: { color: '#fff', fontSize: 14, marginBottom: 10 },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ec4899',
    borderRadius: 3,
  },

  label: { color: '#9ca3af', fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  toggleLabel: { color: '#fff', fontSize: 14 },

  primaryBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  outlineBtnText: { color: '#fff', fontSize: 14 },

  doneIcon: { fontSize: 64, marginBottom: 16 },
  doneTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  doneSubtitle: { color: '#6b7280', fontSize: 14, marginBottom: 24 },
  doneActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
