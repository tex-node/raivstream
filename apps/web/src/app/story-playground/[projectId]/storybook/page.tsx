'use client';

import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, MessageSquare } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';

type StoryBookPage = {
  pageNumber: number;
  sceneId: string;
  imageUrl: string | null;
  title: string;
  text: string;
  imageAlt: string;
};

export default function StoryBookViewerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const isR16 = useR16();
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const currentPageRef = useRef(0);
  const openedTracked = useRef(false);
  const startedTracked = useRef(false);
  const completedTracked = useRef(false);
  const viewedPages = useRef(new Set<number>());
  const storageKey = `raiv_storybook_progress_${projectId}`;
  const trackStoryEvent = trpc.analytics.trackStoryEvent.useMutation();

  const { data: storyBook, isLoading, error } = trpc.story.getStoryBook.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const totalPages = storyBook?.pageCount ?? 0;
  const maxPage = totalPages;
  const activePage = useMemo(() => {
    if (!storyBook) return null;
    if (currentPage === 0) return null;
    return storyBook.pages[currentPage - 1] as StoryBookPage | undefined;
  }, [currentPage, storyBook]);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey) ?? '0');
    if (Number.isFinite(saved) && saved > 0) {
      setHasSavedProgress(true);
      setCurrentPage(saved);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storyBook) return;
    setCurrentPage((page) => Math.min(Math.max(page, 0), storyBook.pageCount));
  }, [storyBook]);

  useEffect(() => {
    if (!storyBook) return;
    window.localStorage.setItem(storageKey, String(currentPage));
    currentPageRef.current = currentPage;
  }, [currentPage, storageKey, storyBook]);

  useEffect(() => {
    if (!storyBook || openedTracked.current) return;
    openedTracked.current = true;
    trackStoryEvent.mutate({
      event: 'storybook_opened',
      projectId,
      properties: {
        audienceMode: isR16 ? 'KIDS' : 'GENERAL',
        pageCount: storyBook.pageCount,
      },
    });
  }, [isR16, projectId, storyBook, trackStoryEvent]);

  useEffect(() => {
    if (!storyBook || currentPage <= 0) return;
    if (!startedTracked.current) {
      startedTracked.current = true;
      trackStoryEvent.mutate({
        event: 'storybook_started',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageCount: storyBook.pageCount },
      });
    }
    if (!viewedPages.current.has(currentPage)) {
      viewedPages.current.add(currentPage);
      trackStoryEvent.mutate({
        event: 'storybook_page_viewed',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageNumber: currentPage, pageCount: storyBook.pageCount },
      });
    }
    if (currentPage === storyBook.pageCount && !completedTracked.current) {
      completedTracked.current = true;
      trackStoryEvent.mutate({
        event: 'storybook_completed',
        projectId,
        properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL', pageCount: storyBook.pageCount },
      });
    }
  }, [currentPage, isR16, projectId, storyBook, trackStoryEvent]);

  useEffect(() => {
    return () => {
      if (!openedTracked.current) return;
      trackStoryEvent.mutate({
        event: 'storybook_exit',
        projectId,
        properties: {
          audienceMode: isR16 ? 'KIDS' : 'GENERAL',
          lastPage: currentPageRef.current,
          completed: completedTracked.current,
        },
      });
    };
  }, [isR16, projectId, trackStoryEvent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setCurrentPage((page) => Math.min(maxPage, page + 1));
      if (event.key === 'ArrowLeft') setCurrentPage((page) => Math.max(0, page - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maxPage]);

  const goNext = () => setCurrentPage((page) => Math.min(maxPage, page + 1));
  const goBack = () => setCurrentPage((page) => Math.max(0, page - 1));
  const submitFeedback = () => {
    if (!feedback.trim()) return;
    trackStoryEvent.mutate({
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
    <div className={`${isFullscreen ? 'min-h-screen bg-[#fff8ec]' : 'min-h-screen bg-[#fff8ec]'} text-[#172033]`}>
      {!isFullscreen && <Navbar />}
      <main className={`${isFullscreen ? 'px-3 py-3' : 'mx-auto max-w-6xl px-4 pb-12 pt-24'} transition-all`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/story-playground" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10">
            <ArrowLeft size={18} />
            {isR16 ? 'Back' : 'Story Playground'}
          </Link>
          <button
            type="button"
            onClick={() => setIsFullscreen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#172033] px-4 py-2 text-sm font-black text-white"
          >
            <Maximize2 size={16} />
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          {!isR16 && (
            <button
              type="button"
              onClick={() => setFeedbackOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10"
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
            <p className="mt-2 font-semibold text-[#596070]">{error.message}</p>
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
                    onClick={() => setCurrentPage(index)}
                    className={`h-3 rounded-full transition-all ${currentPage === index ? 'w-8 bg-[#2f80ed]' : 'w-3 bg-[#d7cfbf]'}`}
                  />
                ))}
              </div>
            </div>

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
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={storyBook.pageCount === 0}
                    className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl bg-[#2f80ed] px-6 py-4 text-lg font-black text-white disabled:opacity-50"
                  >
                    {isR16 ? 'Read Story' : hasSavedProgress ? 'Continue Reading' : 'Start Reading'}
                    <ChevronRight size={22} />
                  </button>
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
                    {activePage.text}
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ece4d4] px-5 py-3 font-black text-[#172033] disabled:opacity-40"
              >
                <ChevronLeft size={20} />
                {isR16 ? 'Back' : 'Previous'}
              </button>
              <p className="text-center text-sm font-bold text-[#596070]">
                {currentPage === maxPage ? (isR16 ? 'The End' : 'End of story') : isR16 ? 'Swipe or tap Next Page' : 'Use arrow keys, swipe, or tap Next'}
              </p>
              <button
                type="button"
                onClick={goNext}
                disabled={currentPage === maxPage}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white disabled:opacity-40"
              >
                {isR16 ? 'Next Page' : 'Next'}
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
