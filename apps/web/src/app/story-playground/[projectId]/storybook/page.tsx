'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, MessageSquare } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useStorybookReadingEngine, type ReadingAnalyticsEvent } from '@/lib/storybookReading';

type StoryBookPage = {
  pageNumber: number;
  sceneId: string;
  imageUrl: string | null;
  title: string;
  text: string;
  imageAlt: string;
};

const readAloudEnabled = process.env.NEXT_PUBLIC_STORYBOOK_READ_ALOUD_ENABLED === 'true';
const readingDebugEnabled = process.env.NEXT_PUBLIC_STORYBOOK_READING_DEBUG === 'true';

function storybookErrorCopy(message?: string, code?: string, isR16?: boolean) {
  if (code === 'UNAUTHORIZED') return isR16 ? 'Please sign in to read this story.' : 'Please sign in to view this storybook.';
  if (code === 'FORBIDDEN') return isR16 ? 'This story belongs to another account.' : 'You do not have permission to view this storybook.';
  const normalized = message?.toLowerCase() ?? '';
  if (normalized.includes('picture card') || normalized.includes('scene card')) return isR16 ? 'This story needs picture cards first.' : 'This story does not have picture cards yet.';
  if (normalized.includes('not been written') || normalized.includes('chapter')) return isR16 ? 'This story is not ready yet.' : 'This story has not been written yet.';
  if (normalized.includes('archived')) return isR16 ? 'This story is not available right now.' : 'This storybook has been archived.';
  if (code === 'NOT_FOUND') return isR16 ? 'We could not find this story.' : 'This storybook could not be found.';
  return message ?? (isR16 ? 'We could not open this book.' : 'Storybook unavailable.');
}

export default function StoryBookViewerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const isR16 = useR16();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const currentPageRef = useRef(0);
  const openedTracked = useRef(false);
  const startedTracked = useRef(false);
  const completedTracked = useRef(false);
  const viewedPages = useRef(new Set<number>());
  const trackStoryEvent = trpc.analytics.trackStoryEvent.useMutation();
  const trackStoryEventRef = useRef(trackStoryEvent.mutate);

  useEffect(() => {
    trackStoryEventRef.current = trackStoryEvent.mutate;
  }, [trackStoryEvent.mutate]);

  const { data: storyBook, isLoading, error } = trpc.story.getStoryBook.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const totalPages = storyBook?.pageCount ?? 0;
  const maxPage = totalPages;
  const readablePages = useMemo(() => {
    return ((storyBook?.pages ?? []) as StoryBookPage[]).map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    }));
  }, [storyBook?.pages]);
  const trackNarrationEvent = useCallback((event: ReadingAnalyticsEvent, properties: Record<string, unknown>) => {
    trackStoryEventRef.current({
      event,
      projectId,
      properties,
    });
  }, [projectId]);
  const reading = useStorybookReadingEngine({
    projectId,
    pages: readablePages,
    totalPages,
    audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    enabled: readAloudEnabled,
    debug: readingDebugEnabled,
    onEvent: trackNarrationEvent,
  });
  const currentPage = reading.currentPage;
  const activePage = useMemo(() => {
    if (!storyBook) return null;
    if (currentPage === 0) return null;
    return storyBook.pages[currentPage - 1] as StoryBookPage | undefined;
  }, [currentPage, storyBook]);

  useEffect(() => {
    if (!storyBook) return;
    currentPageRef.current = currentPage;
  }, [currentPage, storyBook]);

  useEffect(() => {
    if (!storyBook || openedTracked.current) return;
    openedTracked.current = true;
    trackStoryEventRef.current({
      event: 'storybook_opened',
      projectId,
      properties: {
        audienceMode: isR16 ? 'KIDS' : 'GENERAL',
        pageCount: storyBook.pageCount,
      },
    });
  }, [isR16, projectId, storyBook]);

  useEffect(() => {
    if (!storyBook || currentPage <= 0) return;
    if (!startedTracked.current) {
      startedTracked.current = true;
      trackStoryEventRef.current({
        event: 'storybook_started',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageCount: storyBook.pageCount },
      });
    }
    if (!viewedPages.current.has(currentPage)) {
      viewedPages.current.add(currentPage);
      trackStoryEventRef.current({
        event: 'storybook_page_viewed',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageNumber: currentPage, pageCount: storyBook.pageCount },
      });
    }
    if (currentPage === storyBook.pageCount && !completedTracked.current) {
      completedTracked.current = true;
      trackStoryEventRef.current({
        event: 'storybook_completed',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageCount: storyBook.pageCount },
      });
    }
  }, [currentPage, isR16, projectId, storyBook]);

  useEffect(() => {
    return () => {
      if (!openedTracked.current) return;
      trackStoryEventRef.current({
        event: 'storybook_exit',
        projectId,
        properties: {
          audienceMode: isR16 ? 'KIDS' : 'GENERAL',
          lastPage: currentPageRef.current,
          completed: completedTracked.current,
        },
      });
    };
  }, [isR16, projectId]);

  const nextPage = reading.nextPage;
  const previousPage = reading.previousPage;
  const selectPage = reading.selectPage;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') nextPage();
      if (event.key === 'ArrowLeft') previousPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextPage, previousPage]);

  const goNext = () => nextPage();
  const goBack = () => previousPage();
  const onReadAloud = () => {
    if (!readAloudEnabled) return;
    if (reading.isPaused) {
      reading.resume();
      return;
    }
    if (reading.isReading) {
      reading.pause();
      return;
    }
    reading.start();
  };
  const submitFeedback = () => {
    if (!feedback.trim()) return;
    trackStoryEventRef.current({
      event: 'story_feedback_submitted',
      projectId,
      properties: {
        audienceMode: isR16 ? 'KIDS' : 'GENERAL',
        source: 'storybook',
        pageNumber: currentPage,
        message: feedback.trim().slice(0, 800),
      },
    });
    setFeedback('');
    setFeedbackOpen(false);
    setFeedbackMessage(isR16 ? 'Thank you.' : 'Feedback saved.');
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) goNext();
    else goBack();
  };

  return (
    <div className="min-h-screen bg-[#fff8ec] text-[#172033]">
      {!isFullscreen && <Navbar />}
      <main className={`${isFullscreen ? 'px-3 py-3' : 'mx-auto max-w-6xl px-4 pb-12 pt-24'} transition-all`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/story-playground" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#172033]/20">
            <ArrowLeft size={18} />
            {isR16 ? 'Back' : 'Story Playground'}
          </Link>
          <button
            type="button"
            onClick={() => setIsFullscreen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#172033] px-4 py-2 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <Maximize2 size={16} />
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          {!isR16 && (
            <button
              type="button"
              onClick={() => setFeedbackOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#172033]/20"
            >
              <MessageSquare size={16} />
              Feedback
            </button>
          )}
        </div>

        {feedbackMessage && !isR16 && (
          <div className="mb-4 rounded-xl bg-[#dff8e9] px-4 py-3 text-sm font-black text-[#17643a]">{feedbackMessage}</div>
        )}

        {feedbackOpen && !isR16 && (
          <section className="mb-4 rounded-2xl border-2 border-[#172033]/10 bg-white p-4">
            <label className="text-sm font-black uppercase tracking-wide text-[#596070]" htmlFor="storybook-feedback">Storybook feedback</label>
            <textarea
              id="storybook-feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              maxLength={800}
              rows={3}
              className="mt-2 w-full rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-semibold outline-none focus:border-[#2f80ed]"
              placeholder="What should we improve?"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setFeedbackOpen(false)} className="rounded-xl bg-[#ece4d4] px-4 py-2 text-sm font-black text-[#172033]">
                Cancel
              </button>
              <button type="button" onClick={submitFeedback} disabled={!feedback.trim()} className="rounded-xl bg-[#172033] px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                Send
              </button>
            </div>
          </section>
        )}

        {isLoading && (
          <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-10 text-center text-xl font-black">
            {isR16 ? 'Opening your book...' : 'Loading storybook...'}
          </section>
        )}

        {error && (
          <section className="rounded-2xl border-2 border-[#b13b63]/20 bg-white p-8 text-center">
            <h1 className="text-2xl font-black">{isR16 ? 'We could not open this book.' : 'Storybook unavailable'}</h1>
            <p className="mt-2 font-semibold text-[#596070]">{storybookErrorCopy(error.message, error.data?.code, isR16)}</p>
            <Link href="/story-playground" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172033] px-5 py-3 font-black text-white">
              <ArrowLeft size={18} />
              {isR16 ? 'Back' : 'Back to Story Playground'}
            </Link>
          </section>
        )}

        {storyBook && (
          <section
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="overflow-hidden rounded-2xl border-2 border-[#172033]/10 bg-white shadow-[0_18px_0_rgba(23,32,51,0.08)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#172033]/10 px-4 py-3 md:px-6">
              <p className="text-sm font-black uppercase tracking-wide text-[#2f80ed]">
                {currentPage === 0 ? (isR16 ? 'Cover' : 'Storybook Cover') : `${isR16 ? 'Page' : 'Page'} ${currentPage} of ${storyBook.pageCount}`}
              </p>
              <div className="flex items-center gap-2">
                {Array.from({ length: storyBook.pageCount + 1 }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={index === 0 ? 'Cover page' : `Page ${index}`}
                    onClick={() => selectPage(index)}
                    className={`h-3 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f80ed] focus-visible:ring-offset-2 ${currentPage === index ? 'w-8 bg-[#2f80ed]' : 'w-3 bg-[#d7cfbf]'}`}
                  />
                ))}
              </div>
            </div>

            {reading.unavailableMessage && (
              <div className="border-b border-[#172033]/10 bg-[#fff4d1] px-4 py-3 text-sm font-bold text-[#72520f] md:px-6">
                {isR16 ? 'Read To Me is not available in this browser. You can still read the story.' : reading.unavailableMessage}
              </div>
            )}

            {!readAloudEnabled && (
              <div className="border-b border-[#172033]/10 bg-[#fff4d1] px-4 py-3 text-sm font-bold text-[#72520f] md:px-6">
                {isR16 ? 'Read To Me is being improved and will return soon.' : 'Read-aloud is being improved and will return soon.'}
              </div>
            )}

            {currentPage === 0 ? (
              <div className="grid min-h-[68vh] gap-6 p-5 md:grid-cols-[1.1fr_0.9fr] md:p-8">
                <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center" style={storyBook.coverImage ? { backgroundImage: `url("${storyBook.coverImage}")` } : undefined}>
                  {!storyBook.coverImage && (
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-4 text-[#2f80ed]" size={58} />
                      <p className="text-2xl font-black text-[#2f80ed]">{isR16 ? 'Pictures coming soon' : 'Illustration Coming Soon'}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-[#2fbf71]">{isR16 ? 'Your picture book' : 'Storybook'}</p>
                  <h1 className="text-4xl font-black leading-tight md:text-6xl">{storyBook.project.title}</h1>
                  <p className="mt-5 text-2xl font-bold leading-snug text-[#596070]">
                    {storyBook.project.mainCharacter ? `A story with ${storyBook.project.mainCharacter}.` : 'A story made by you.'}
                  </p>
                  {storyBook.project.theme && (
                    <p className="mt-3 rounded-xl bg-[#f5f1e8] px-4 py-3 text-lg font-bold text-[#596070]">
                      {isR16 ? `About ${storyBook.project.theme}` : `Theme: ${storyBook.project.theme}`}
                    </p>
                  )}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => selectPage(1)}
                      disabled={storyBook.pageCount === 0}
                      className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#2f80ed] px-6 py-4 text-lg font-black text-white disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f80ed]/25"
                    >
                      {isR16 ? 'Read Story' : reading.hasSavedProgress ? 'Continue Reading' : 'Start Reading'}
                      <ChevronRight size={22} />
                    </button>
                    {readAloudEnabled && (
                      <button
                        type="button"
                        onClick={onReadAloud}
                        disabled={storyBook.pageCount === 0}
                        aria-label={isR16 ? 'Read To Me' : 'Read Aloud'}
                        className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#172033] px-6 py-4 text-lg font-black text-white disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#172033]/25"
                      >
                        {isR16 ? 'Read To Me' : 'Read Aloud'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : activePage ? (
              <article className="grid min-h-[68vh] gap-6 p-5 md:grid-cols-[1.05fr_0.95fr] md:p-8">
                <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center" style={activePage.imageUrl ? { backgroundImage: `url("${activePage.imageUrl}")` } : undefined}>
                  {!activePage.imageUrl && (
                    <div className="px-6 text-center">
                      <ImageIcon className="mx-auto mb-4 text-[#2f80ed]" size={58} />
                      <p className="text-2xl font-black text-[#2f80ed]">{isR16 ? 'Picture coming soon' : 'Illustration Coming Soon'}</p>
                    </div>
                  )}
                  {activePage.imageUrl && <span className="sr-only">{activePage.imageAlt}</span>}
                </div>
                <div className="flex flex-col justify-center">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-[#2f80ed]">Page {activePage.pageNumber} of {storyBook.pageCount}</p>
                  <h1 className="text-3xl font-black leading-tight md:text-5xl">{activePage.title}</h1>
                  <p className="mt-6 text-2xl font-bold leading-10 text-[#243044] md:text-3xl md:leading-[3.2rem]">
                    {readAloudEnabled && reading.sentences.length > 0 ? reading.sentences.map((sentence, index) => (
                      <span
                        key={`${activePage.sceneId}-${index}`}
                        className={`rounded-lg px-1 transition-colors ${index === reading.currentSentenceIndex && (reading.isReading || reading.isPaused) ? (isR16 ? 'bg-[#ffef9f] text-[#172033]' : 'bg-[#dbeafe] text-[#172033]') : ''}`}
                      >
                        {sentence}{' '}
                      </span>
                    )) : activePage.text}
                  </p>
                </div>
              </article>
            ) : (
              <div className="p-10 text-center text-3xl font-black">{isR16 ? 'The End' : 'The End'}</div>
            )}

            <div className="flex flex-col gap-3 border-t border-[#172033]/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <button
                type="button"
                onClick={goBack}
                disabled={currentPage === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ece4d4] px-5 py-3 font-black text-[#172033] disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#172033]/15"
              >
                <ChevronLeft size={20} />
                {isR16 ? 'Back' : 'Previous'}
              </button>
              <div className="flex flex-col items-center gap-2 text-center">
                {readAloudEnabled && (
                  <button
                    type="button"
                    onClick={onReadAloud}
                    disabled={currentPage === 0 || reading.isCompleted}
                    aria-label={reading.isReading ? (reading.isPaused ? (isR16 ? 'Keep Reading' : 'Resume') : 'Pause') : (isR16 ? 'Read To Me' : 'Read Aloud')}
                    className="inline-flex items-center justify-center rounded-xl bg-[#172033] px-5 py-3 text-sm font-black text-white disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#172033]/25"
                  >
                    {reading.isReading ? (reading.isPaused ? (isR16 ? 'Keep Reading' : 'Resume') : 'Pause') : (isR16 ? 'Read To Me' : 'Read Aloud')}
                  </button>
                )}
                <p className="text-sm font-bold text-[#596070]">
                  {reading.isCompleted ? (isR16 ? 'The End' : 'Finished') : currentPage === maxPage ? (isR16 ? 'The End' : 'Finish') : isR16 ? 'Swipe or tap Next Page' : 'Use arrow keys, swipe, or tap Next'}
                </p>
              </div>
              <button
                type="button"
                onClick={goNext}
                disabled={currentPage === maxPage}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2f80ed]/25"
              >
                {currentPage === maxPage ? (isR16 ? 'The End' : 'Finish') : isR16 ? 'Next Page' : 'Next'}
                <ChevronRight size={20} />
              </button>
            </div>
          </section>
        )}

        {/* TODO: Phase 5 candidates: read-aloud, narration, page-turn sound, PDF export, print book, library publishing, parent approval, classroom mode. */}
      </main>
    </div>
  );
}
