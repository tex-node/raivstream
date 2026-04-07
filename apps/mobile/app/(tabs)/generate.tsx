import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

const { width: W } = Dimensions.get('window');

type AspectRatio = '9:16' | '16:9' | '1:1';

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  live:          { bg: 'rgba(16,185,129,0.15)', text: '#34d399' },
  beta:          { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24' },
  'coming-soon': { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.3)' },
};

const BADGE_LABELS: Record<string, string> = {
  live:          'Live',
  beta:          'Beta',
  'coming-soon': 'Soon',
};

const AR_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: '9:16',  label: '9:16' },
  { value: '16:9',  label: '16:9' },
  { value: '1:1',   label: '1:1' },
];

export default function GenerateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);

  const [selectedModel, setSelectedModel] = useState('GROK_IMAGINE');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [pubTitle, setPubTitle] = useState('');

  const { data: models } = trpc.generation.listModels.useQuery();
  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setPollEnabled(job.status !== 'COMPLETED' && job.status !== 'FAILED');
    },
    onError: (err) => Alert.alert('Generation failed', err.message),
  });
  const { data: jobStatus } = trpc.generation.pollStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId && pollEnabled, refetchInterval: 3000 }
  );
  const publishJob = trpc.generation.publish.useMutation({
    onSuccess: (video) => router.push(`/video/${video.id}`),
    onError: (err) => Alert.alert('Publish failed', err.message),
  });
  const { data: myJobs } = trpc.generation.myJobs.useQuery(
    { limit: 9 },
    { enabled: isSignedIn }
  );

  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED' || jobStatus?.status === 'FAILED') {
      setPollEnabled(false);
    }
  }, [jobStatus?.status]);

  if (!isSignedIn) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.heading}>AI Video Studio</Text>
        <Text style={styles.subtitle}>Sign in to generate AI videos</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentModel = models?.find((m) => m.id === selectedModel);
  const isVideoModel = (currentModel?.maxDuration ?? 0) > 0;
  const isGenerating =
    createJob.isPending ||
    (pollEnabled &&
      jobStatus?.status !== 'COMPLETED' &&
      jobStatus?.status !== 'FAILED');

  const activeJob = jobStatus;

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setActiveJobId(null);
    setShowPublish(false);
    createJob.mutate({
      model: selectedModel as never,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      aspectRatio,
      duration: isVideoModel ? duration : undefined,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>✨ AI Studio</Text>
      <Text style={styles.subtitle}>Generate videos with AI</Text>

      {/* Model selector */}
      <Text style={styles.sectionLabel}>Model</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll}>
        {(models ?? []).map((model) => {
          const isCS = model.badge === 'coming-soon';
          const isSelected = selectedModel === model.id;
          const bc = BADGE_COLORS[model.badge] ?? BADGE_COLORS['coming-soon'];
          return (
            <TouchableOpacity
              key={model.id}
              onPress={() => !isCS && setSelectedModel(model.id)}
              disabled={isCS}
              style={[
                styles.modelCard,
                isSelected && styles.modelCardActive,
                isCS && styles.modelCardDisabled,
              ]}
            >
              <Text style={styles.modelIcon}>{model.icon}</Text>
              <Text style={[styles.modelLabel, isCS && styles.textDim]}>{model.label}</Text>
              <View style={[styles.badge, { backgroundColor: bc.bg }]}>
                <Text style={[styles.badgeText, { color: bc.text }]}>
                  {BADGE_LABELS[model.badge] ?? model.badge}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Prompt */}
      <Text style={styles.sectionLabel}>Prompt</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Describe the video or image you want to generate…"
        placeholderTextColor="#6b7280"
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      {/* Aspect ratio */}
      <Text style={styles.sectionLabel}>Format</Text>
      <View style={styles.arRow}>
        {AR_OPTIONS.map((ar) => (
          <TouchableOpacity
            key={ar.value}
            onPress={() => setAspectRatio(ar.value)}
            style={[styles.arBtn, aspectRatio === ar.value && styles.arBtnActive]}
          >
            <Text style={[styles.arBtnText, aspectRatio === ar.value && styles.arBtnTextActive]}>
              {ar.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Duration slider — video models only */}
      {isVideoModel && (
        <>
          <Text style={styles.sectionLabel}>Duration — {duration}s</Text>
          <View style={styles.durationRow}>
            <TouchableOpacity
              onPress={() => setDuration(Math.max(1, duration - 1))}
              style={styles.durationBtn}
            >
              <Text style={styles.durationBtnText}>−</Text>
            </TouchableOpacity>
            <View style={styles.durationBar}>
              <View
                style={[
                  styles.durationFill,
                  { width: `${((duration - 1) / ((currentModel?.maxDuration ?? 10) - 1)) * 100}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              onPress={() => setDuration(Math.min(currentModel?.maxDuration ?? 10, duration + 1))}
              style={styles.durationBtn}
            >
              <Text style={styles.durationBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Advanced */}
      <TouchableOpacity
        onPress={() => setShowAdvanced(!showAdvanced)}
        style={styles.advancedToggle}
      >
        <Text style={styles.advancedToggleText}>
          {showAdvanced ? '▲' : '▼'} Advanced options
        </Text>
      </TouchableOpacity>

      {showAdvanced && (
        <>
          <Text style={styles.sectionLabel}>Negative Prompt</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={negativePrompt}
            onChangeText={setNegativePrompt}
            placeholder="What to avoid…"
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={2}
            maxLength={300}
          />
        </>
      )}

      {/* Generate button */}
      <TouchableOpacity
        style={[styles.generateBtn, (!prompt.trim() || isGenerating) && styles.generateBtnDisabled]}
        onPress={handleGenerate}
        disabled={!prompt.trim() || isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateBtnText}>✨ Generate</Text>
        )}
      </TouchableOpacity>

      {/* Output */}
      {(activeJob || isGenerating) && (
        <View style={styles.outputCard}>
          <Text style={styles.sectionLabel}>Output</Text>
          {isGenerating && !activeJob?.outputUrl ? (
            <View style={styles.outputPlaceholder}>
              <ActivityIndicator color="#ec4899" size="large" />
              <Text style={styles.statusText}>
                {activeJob?.status === 'GENERATING' ? 'Generating…' : 'Queued…'}
              </Text>
            </View>
          ) : activeJob?.status === 'FAILED' ? (
            <View style={[styles.outputPlaceholder, styles.outputError]}>
              <Text style={styles.errorText}>⚠️ {activeJob.errorMessage ?? 'Generation failed'}</Text>
            </View>
          ) : activeJob?.outputUrl ? (
            <View>
              <Image
                source={{ uri: activeJob.outputUrl }}
                style={styles.outputImage}
                resizeMode="cover"
              />
              {!showPublish ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => {
                    setShowPublish(true);
                    setPubTitle(prompt.slice(0, 60));
                  }}
                >
                  <Text style={styles.primaryBtnText}>Publish to Feed</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <TextInput
                    style={styles.input}
                    value={pubTitle}
                    onChangeText={setPubTitle}
                    placeholder="Video title"
                    placeholderTextColor="#6b7280"
                    maxLength={100}
                  />
                  <TouchableOpacity
                    style={[styles.primaryBtn, publishJob.isPending && styles.generateBtnDisabled]}
                    onPress={() => publishJob.mutate({
                      jobId: activeJob.id,
                      title: pubTitle || prompt.slice(0, 60),
                    })}
                    disabled={publishJob.isPending}
                  >
                    {publishJob.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Confirm & Publish</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}

      {/* History */}
      {myJobs && myJobs.jobs.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionLabel}>Recent Generations</Text>
          <View style={styles.historyGrid}>
            {myJobs.jobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={styles.historyThumb}
                onPress={() => setActiveJobId(job.id)}
              >
                {job.thumbnailUrl || job.outputUrl ? (
                  <Image
                    source={{ uri: job.thumbnailUrl ?? job.outputUrl! }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.historyPlaceholder}>
                    <Text style={styles.historyPlaceholderText}>
                      {job.status === 'FAILED' ? '✗' : job.status === 'COMPLETED' ? '✓' : '…'}
                    </Text>
                  </View>
                )}
                <View style={styles.historyOverlay}>
                  <Text style={styles.historyPrompt} numberOfLines={1}>{job.prompt}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const THUMB = (W - 40 - 8) / 3;

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#000' },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  center:  { alignItems: 'center', justifyContent: 'center', flex: 1 },

  heading:  { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#6b7280', fontSize: 13, marginBottom: 20 },

  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 16,
  },

  modelScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  modelCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 12,
    marginRight: 10,
    width: 110,
    alignItems: 'center',
  },
  modelCardActive: { borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.1)' },
  modelCardDisabled: { opacity: 0.4 },
  modelIcon: { fontSize: 28, marginBottom: 6 },
  modelLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  textDim: { color: 'rgba(255,255,255,0.4)' },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },

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
  multiline: { minHeight: 70, textAlignVertical: 'top' },

  arRow: { flexDirection: 'row', gap: 8 },
  arBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  arBtnActive: { borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.15)' },
  arBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  arBtnTextActive: { color: '#ec4899' },

  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  durationBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  durationBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  durationFill: { height: '100%', backgroundColor: '#ec4899', borderRadius: 3 },

  advancedToggle: { marginTop: 12 },
  advancedToggleText: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },

  generateBtn: {
    marginTop: 20,
    backgroundColor: '#ec4899',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.45 },
  generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  primaryBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  outputCard: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
  },
  outputPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  outputError: { backgroundColor: 'rgba(239,68,68,0.06)' },
  outputImage: { width: '100%', aspectRatio: 9 / 16, borderRadius: 12, backgroundColor: '#111' },
  statusText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  errorText: { color: '#f87171', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },

  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  historyThumb: {
    width: THUMB,
    aspectRatio: 9 / 16,
    borderRadius: 8,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  historyPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  historyPlaceholderText: { color: 'rgba(255,255,255,0.3)', fontSize: 18 },
  historyOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  historyPrompt: { color: 'rgba(255,255,255,0.7)', fontSize: 8 },
});
