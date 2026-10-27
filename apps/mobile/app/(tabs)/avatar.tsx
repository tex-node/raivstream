import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';
import { useAuthStore } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

/**
 * D-002 Phase B.2 - mobile Avatar tab.
 *
 * Mirrors the web `/avatar` surface against the same tRPC procedures
 * (`generation.requestAudioUpload` -> presigned R2 PUT -> `generation.create`
 * with `model: 'VEED_FABRIC'` -> `generation.pollStatus`).
 *
 * Upload uses XMLHttpRequest rather than fetch, for the same reason
 * `upload.tsx` does: React Native's fetch exposes no upload progress.
 *
 * R16: mobile has no kids-mode concept, so this tab is exposed to every user.
 * Recorded as an accepted limitation in D-083.
 */

const { width: W } = Dimensions.get('window');
const MODEL = 'VEED_FABRIC';
const POLL_INTERVAL_MS = 3000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

type Resolution = '480p' | '720p' | '1080p';

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
};

function extensionOf(name: string): string {
  const parts = name.split('.');
  return (parts.length > 1 ? parts[parts.length - 1] : '').toLowerCase();
}

export default function AvatarScreen() {
  const insets = useSafeAreaInsets();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);

  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState('audio/mpeg');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [consent, setConsent] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: models } = trpc.generation.listModels.useQuery();
  const fabric = (models ?? []).find((m) => m.id === MODEL) as
    | { creditCost?: number | null; creditCostByResolution?: Record<string, number> }
    | undefined;

  const costByResolution = fabric?.creditCostByResolution;
  const creditCost = costByResolution?.[resolution] ?? fabric?.creditCost ?? null;

  // Only offer tiers the API has priced - a seeded rate enables the pill without
  // an app update (same rule as the web picker).
  const resolutions = useMemo<Resolution[]>(() => {
    const priced = Object.keys(costByResolution ?? {});
    return (priced.length > 0 ? priced : ['480p', '720p']) as Resolution[];
  }, [costByResolution]);

  const requestUpload = trpc.generation.requestAudioUpload.useMutation();

  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setPollEnabled(job.status !== 'COMPLETED');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const { data: jobStatus } = trpc.generation.pollStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId && pollEnabled, refetchInterval: POLL_INTERVAL_MS },
  );

  const isGenerating = createJob.isPending
    || (pollEnabled && jobStatus?.status !== 'COMPLETED' && jobStatus?.status !== 'FAILED');
  const outputUrl = jobStatus?.status === 'COMPLETED' ? jobStatus.outputUrl ?? null : null;
  const canSubmit = Boolean(imageUrl.trim() && audioUrl && consent && !uploading) && !isGenerating;

  const pickAndUpload = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0]!;
      const ext = extensionOf(asset.name ?? 'audio.mp3') || 'mp3';
      const contentType = asset.mimeType ?? MIME_BY_EXT[ext] ?? 'audio/mpeg';
      const size = asset.size ?? MAX_AUDIO_BYTES;

      if (size > MAX_AUDIO_BYTES) {
        setError('Audio must be under 10 MB.');
        return;
      }

      setUploading(true);
      setProgress(0);
      setAudioName(asset.name ?? `audio.${ext}`);
      setAudioMime(contentType);

      const { uploadUrl, publicUrl } = await requestUpload.mutateAsync({
        filename: asset.name ?? `audio.${ext}`,
        contentType,
        fileSizeBytes: size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        // RN accepts a file descriptor here even though the type says Blob.
        xhr.send({ uri: asset.uri, type: contentType, name: asset.name ?? `audio.${ext}` } as unknown as Blob);
      });

      if (!publicUrl) throw new Error('R2 public URL is not configured.');
      setAudioUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setAudioUrl('');
      setAudioName(null);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = () => {
    if (!canSubmit) return;
    setError(null);
    createJob.mutate({
      model: MODEL as never,
      prompt: undefined,
      seedImageUrl: imageUrl.trim(),
      audioUrl,
      resolution,
      consent: true,
    });
  };

  if (!isSignedIn) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>AI Avatar</Text>
        <Text style={styles.muted}>Sign in to generate avatars.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>AI Avatar</Text>
      <Text style={styles.subtitle}>
        Bring your presenter to life. Add an image and an audio track to generate a lip-synced video.
      </Text>

      <Text style={styles.label}>Presenter Image URL</Text>
      <TextInput
        value={imageUrl}
        onChangeText={setImageUrl}
        placeholder="https://example.com/presenter.jpg"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Text style={styles.hint}>Must be a publicly accessible JPG or PNG.</Text>

      <Text style={styles.label}>Audio Track</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={pickAndUpload} disabled={uploading}>
        <Text style={styles.secondaryButtonText}>
          {uploading ? `Uploading… ${progress}%` : audioName ? `✓ ${audioName}` : 'Select Audio File'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>MP3, WAV, or M4A (max 10 MB, 60s).</Text>
      {uploading && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%` }]} />
        </View>
      )}

      <Text style={styles.label}>Resolution</Text>
      <View style={styles.pillRow}>
        {resolutions.map((value) => {
          const selected = resolution === value;
          const price = costByResolution?.[value];
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setResolution(value)}
              style={[styles.pill, selected && styles.pillSelected]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{value}</Text>
              {price != null && <Text style={styles.pillPrice}>{price} cr</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.consentRow} onPress={() => setConsent(!consent)}>
        <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
          {consent && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.consentText}>I confirm I have the rights to use this media.</Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        onPress={handleGenerate}
        disabled={!canSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {isGenerating
            ? 'Generating…'
            : `Generate Avatar${creditCost != null ? ` — ${creditCost} credits` : ''}`}
        </Text>
      </TouchableOpacity>

      {isGenerating && (
        <View style={styles.center}>
          <ActivityIndicator color="#d946a8" />
          <Text style={styles.muted}>This usually takes 45–90 seconds.</Text>
        </View>
      )}

      {outputUrl && (
        <View style={styles.preview}>
          <Video
            source={{ uri: outputUrl }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            style={styles.video}
          />
        </View>
      )}

      {jobStatus?.status === 'FAILED' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>The avatar render failed. Try a shorter audio track.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0b14', paddingHorizontal: 16 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 6, marginBottom: 18 },
  label: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#15151f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 6 },
  secondaryButton: {
    backgroundColor: '#15151f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#d946a8' },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    backgroundColor: '#15151f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  pillSelected: { borderColor: '#d946a8', backgroundColor: 'rgba(217,70,168,0.18)' },
  pillText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700' },
  pillTextSelected: { color: '#ffffff' },
  pillPrice: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 },
  consentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#d946a8', borderColor: '#d946a8' },
  checkmark: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  consentText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1 },
  primaryButton: {
    backgroundColor: '#d946a8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  errorBox: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(217,70,168,0.45)',
    backgroundColor: 'rgba(217,70,168,0.10)',
    padding: 12,
  },
  errorText: { color: '#f0a3d4', fontSize: 13, fontWeight: '600' },
  preview: { marginTop: 20, width: W - 32, height: (W - 32) * 1.4, borderRadius: 14, overflow: 'hidden' },
  video: { flex: 1, backgroundColor: '#000000' },
  muted: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 },
});
