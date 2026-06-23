'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ReadingAnalyticsEvent =
  | 'narration_started'
  | 'narration_paused'
  | 'narration_resumed'
  | 'narration_page_completed'
  | 'narration_completed'
  | 'narration_unavailable';

export type ReadableStorybookPage = {
  pageNumber: number;
  text: string;
};

type ReadingProgress = {
  version?: number;
  pageIndex?: number;
  sentenceIndex?: number;
  mode?: 'manual' | 'read-aloud';
  updatedAt?: string;
  completed?: boolean;
};

type UseStorybookReadingEngineInput = {
  projectId: string;
  pages: ReadableStorybookPage[];
  totalPages: number;
  audienceMode: 'KIDS' | 'GENERAL';
  enabled?: boolean;
  debug?: boolean;
  onEvent?: (event: ReadingAnalyticsEvent, properties: Record<string, unknown>) => void;
};

const progressVersion = 1;

export function splitSentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

export function progressKey(projectId: string) {
  return `raivstream_storybook_progress_${projectId}`;
}

export function normalizeReadingProgress(progress: Partial<ReadingProgress>, totalPages: number) {
  const pageIndex = Number(progress.pageIndex ?? 0);
  const sentenceIndex = Number(progress.sentenceIndex ?? 0);
  return {
    pageIndex: Number.isFinite(pageIndex) ? Math.min(Math.max(pageIndex, 0), totalPages) : 0,
    sentenceIndex: Number.isFinite(sentenceIndex) ? Math.max(0, sentenceIndex) : 0,
    completed: Boolean(progress.completed),
  };
}

function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

function cancelBrowserSpeech() {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}

export function useStorybookReadingEngine({
  projectId,
  pages,
  totalPages,
  audienceMode,
  enabled = false,
  debug = false,
  onEvent,
}: UseStorybookReadingEngineInput) {
  const [currentPage, setCurrentPage] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);

  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isMountedRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const autoAdvancingRef = useRef(false);
  const speakingKeyRef = useRef<string | null>(null);
  const restoredForProjectRef = useRef<string | null>(null);
  const progressRestoredRef = useRef(false);
  const currentPageRef = useRef(0);
  const sentenceIndexRef = useRef(0);
  const isReadingRef = useRef(false);
  const isPausedRef = useRef(false);
  const isCompletedRef = useRef(false);
  const totalPagesRef = useRef(totalPages);
  const audienceModeRef = useRef(audienceMode);
  const enabledRef = useRef(enabled);
  const debugRef = useRef(debug);
  const onEventRef = useRef(onEvent);

  const pageSentences = useMemo(() => pages.map((page) => splitSentences(page.text)), [pages]);
  const activeSentences = currentPage > 0 ? pageSentences[currentPage - 1] ?? [] : [];

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelRequestedRef.current = true;
      activeUtteranceRef.current = null;
      speakingKeyRef.current = null;
      if (enabledRef.current) cancelBrowserSpeech();
    };
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
    sentenceIndexRef.current = currentSentenceIndex;
    isReadingRef.current = isReading;
    isPausedRef.current = isPaused;
    isCompletedRef.current = isCompleted;
    totalPagesRef.current = totalPages;
    audienceModeRef.current = audienceMode;
    enabledRef.current = enabled;
    debugRef.current = debug;
    onEventRef.current = onEvent;
  }, [audienceMode, currentPage, currentSentenceIndex, debug, enabled, isCompleted, isPaused, isReading, onEvent, totalPages]);

  const debugLog = useCallback((action: string, extra: Record<string, unknown> = {}) => {
    if (!debugRef.current || process.env.NODE_ENV === 'production') return;
    console.info('[storybook.reading]', {
      action,
      page: currentPageRef.current,
      sentenceIndex: sentenceIndexRef.current,
      isReading: isReadingRef.current,
      isPaused: isPausedRef.current,
      ...extra,
    });
  }, []);

  const track = useCallback((event: ReadingAnalyticsEvent, extra: Record<string, unknown> = {}) => {
    const pageNumber = currentPageRef.current;
    const sentenceCount = pageNumber > 0 ? pageSentences[pageNumber - 1]?.length ?? 0 : 0;
    debugLog('analytics', { event });
    onEventRef.current?.(event, {
      projectId,
      pageNumber,
      audienceMode: audienceModeRef.current,
      sentenceCount,
      totalPages: totalPagesRef.current,
      ...extra,
    });
  }, [debugLog, pageSentences, projectId]);

  const stopSpeech = useCallback(() => {
    if (!enabledRef.current) return;
    cancelRequestedRef.current = true;
    autoAdvancingRef.current = false;
    activeUtteranceRef.current = null;
    speakingKeyRef.current = null;
    cancelBrowserSpeech();
  }, []);

  const speakSentenceRef = useRef<(page: number, sentenceIndex: number) => void>(() => {});

  const completeNarration = useCallback((page: number, sentenceCount: number) => {
    if (!isMountedRef.current) return;
    stopSpeech();
    setIsReading(false);
    setIsPaused(false);
    setIsCompleted(true);
    track('narration_completed', { pageNumber: page, sentenceCount });
  }, [stopSpeech, track]);

  const handleSentenceEnd = useCallback((page: number, sentenceIndex: number) => {
    debugLog('speech_end', { page, sentenceIndex });
    if (!isMountedRef.current || cancelRequestedRef.current || autoAdvancingRef.current) return;
    if (!enabledRef.current) return;
    autoAdvancingRef.current = true;
    activeUtteranceRef.current = null;
    speakingKeyRef.current = null;

    const sentenceCount = pageSentences[page - 1]?.length ?? 0;
    if (sentenceIndex < sentenceCount - 1) {
      const nextSentence = sentenceIndex + 1;
      setCurrentSentenceIndex(nextSentence);
      window.setTimeout(() => {
        autoAdvancingRef.current = false;
        speakSentenceRef.current(page, nextSentence);
      }, 0);
      return;
    }

    track('narration_page_completed', { pageNumber: page, sentenceCount });
    if (page < totalPagesRef.current) {
      const nextPage = page + 1;
      setCurrentPage(nextPage);
      setCurrentSentenceIndex(0);
      window.setTimeout(() => {
        autoAdvancingRef.current = false;
        speakSentenceRef.current(nextPage, 0);
      }, 0);
      return;
    }

    autoAdvancingRef.current = false;
    completeNarration(page, sentenceCount);
  }, [completeNarration, debugLog, pageSentences, track]);

  const speakSentence = useCallback((page: number, sentenceIndex: number) => {
    debugLog('speak_sentence', { page, sentenceIndex });
    if (!enabledRef.current) return;
    if (!isMountedRef.current || !isReadingRef.current || isPausedRef.current) return;
    if (!canSpeak()) {
      setIsReading(false);
      setIsPaused(false);
      setUnavailableMessage('Read-aloud is not available in this browser. You can still read the story manually.');
      track('narration_unavailable', { reason: 'speech_synthesis_unavailable' });
      return;
    }

    const sentence = pageSentences[page - 1]?.[sentenceIndex];
    if (!sentence) {
      setIsReading(false);
      setIsPaused(false);
      return;
    }

    const speakingKey = `${page}:${sentenceIndex}:${sentence}`;
    if (activeUtteranceRef.current && speakingKeyRef.current === speakingKey) return;

    cancelRequestedRef.current = true;
    cancelBrowserSpeech();
    cancelRequestedRef.current = false;

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = audienceModeRef.current === 'KIDS' ? 0.88 : 0.95;
    utterance.pitch = audienceModeRef.current === 'KIDS' ? 1.08 : 1;
    utterance.onend = () => handleSentenceEnd(page, sentenceIndex);
    utterance.onerror = () => {
      if (!isMountedRef.current || cancelRequestedRef.current) return;
      activeUtteranceRef.current = null;
      speakingKeyRef.current = null;
      setIsReading(false);
      setIsPaused(false);
      setUnavailableMessage('Read-aloud stopped. You can keep reading manually.');
    };

    activeUtteranceRef.current = utterance;
    speakingKeyRef.current = speakingKey;
    window.speechSynthesis.speak(utterance);
  }, [debugLog, handleSentenceEnd, pageSentences, track]);

  useEffect(() => {
    speakSentenceRef.current = speakSentence;
  }, [speakSentence]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabledRef.current) return;
    if (totalPages <= 0) return;
    if (restoredForProjectRef.current === projectId) return;
    restoredForProjectRef.current = projectId;
    progressRestoredRef.current = true;
    try {
      const saved = window.localStorage.getItem(progressKey(projectId));
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<ReadingProgress>;
      const restored = normalizeReadingProgress(parsed, totalPages);
      setCurrentPage(restored.pageIndex);
      setCurrentSentenceIndex(restored.sentenceIndex);
      setIsCompleted(restored.completed);
      setHasSavedProgress(restored.pageIndex > 0 || restored.completed);
    } catch {
      setHasSavedProgress(false);
    }
  }, [projectId, totalPages]);

  useEffect(() => {
    if (!progressRestoredRef.current || typeof window === 'undefined') return;
    if (!enabledRef.current) return;
    debugLog('persist_progress');
    window.localStorage.setItem(progressKey(projectId), JSON.stringify({
      version: progressVersion,
      pageIndex: currentPage,
      sentenceIndex: currentSentenceIndex,
      mode: isReading ? 'read-aloud' : 'manual',
      completed: isCompleted,
      updatedAt: new Date().toISOString(),
    }));
  }, [currentPage, currentSentenceIndex, debugLog, isCompleted, isReading, projectId]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage <= 0) return;
    const sentenceCount = pageSentences[currentPage - 1]?.length ?? 0;
    if (sentenceCount > 0 && currentSentenceIndex >= sentenceCount) setCurrentSentenceIndex(sentenceCount - 1);
  }, [currentPage, currentSentenceIndex, pageSentences]);

  const selectPage = useCallback((page: number) => {
    stopSpeech();
    setIsReading(false);
    setIsPaused(false);
    setIsCompleted(false);
    setCurrentPage(Math.min(Math.max(page, 0), totalPagesRef.current));
    setCurrentSentenceIndex(0);
  }, [stopSpeech]);

  const nextPage = useCallback(() => {
    selectPage(Math.min(totalPagesRef.current, currentPageRef.current + 1));
  }, [selectPage]);

  const previousPage = useCallback(() => {
    selectPage(Math.max(0, currentPageRef.current - 1));
  }, [selectPage]);

  const start = useCallback(() => {
    debugLog('start');
    if (!enabledRef.current) {
      setUnavailableMessage('Read-aloud is being improved and will return soon.');
      return;
    }
    if (isReadingRef.current && !isPausedRef.current && activeUtteranceRef.current) return;
    if (!canSpeak()) {
      const message = 'Read-aloud is not available in this browser. You can still read the story manually.';
      setUnavailableMessage(message);
      track('narration_unavailable', { reason: 'speech_synthesis_unavailable' });
      return;
    }

    const targetPage = currentPageRef.current > 0 ? currentPageRef.current : 1;
    const safePage = Math.min(Math.max(targetPage, 1), totalPagesRef.current);
    const sentenceCount = pageSentences[safePage - 1]?.length ?? 0;
    if (sentenceCount === 0) {
      setUnavailableMessage('There is no readable text on this page yet.');
      return;
    }

    const safeSentence = Math.min(Math.max(sentenceIndexRef.current, 0), sentenceCount - 1);
    stopSpeech();
    cancelRequestedRef.current = false;
    setUnavailableMessage(null);
    setIsCompleted(false);
    setIsPaused(false);
    setIsReading(true);
    isReadingRef.current = true;
    isPausedRef.current = false;
    setCurrentPage(safePage);
    setCurrentSentenceIndex(safeSentence);
    track('narration_started', { pageNumber: safePage, sentenceCount });
    speakSentence(safePage, safeSentence);
  }, [debugLog, pageSentences, speakSentence, stopSpeech, track]);

  const pause = useCallback(() => {
    debugLog('pause');
    if (!enabledRef.current) return;
    if (!isReadingRef.current || isPausedRef.current || !canSpeak()) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    isPausedRef.current = true;
    track('narration_paused');
  }, [debugLog, track]);

  const resume = useCallback(() => {
    debugLog('resume');
    if (!enabledRef.current) return;
    if (!isReadingRef.current || !isPausedRef.current || !canSpeak()) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
    isPausedRef.current = false;
    track('narration_resumed');
  }, [debugLog, track]);

  const stop = useCallback(() => {
    debugLog('stop');
    stopSpeech();
    setIsReading(false);
    setIsPaused(false);
    isReadingRef.current = false;
    isPausedRef.current = false;
  }, [debugLog, stopSpeech]);

  return {
    currentPage,
    currentSentenceIndex,
    sentences: activeSentences,
    isReading,
    isPaused,
    isCompleted,
    hasSavedProgress,
    unavailableMessage,
    speechSynthesisAvailable: enabled && (typeof window === 'undefined' ? true : canSpeak()),
    start,
    pause,
    resume,
    stop,
    nextPage,
    previousPage,
    selectPage,
  };
}
