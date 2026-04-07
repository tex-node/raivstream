'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

type UploadStep = 'select' | 'uploading' | 'metadata' | 'done';

export default function UploadPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();

  const [step, setStep] = useState<UploadStep>('select');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isPremiumOnly, setIsPremiumOnly] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const requestUpload = trpc.video.requestUpload.useMutation();
  const confirmUpload = trpc.video.confirmUpload.useMutation();
  const updateMetadata = trpc.video.updateMetadata.useMutation({
    onSuccess: () => setStep('done'),
  });

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        alert('Please select a video file.');
        return;
      }

      setUploadError(null);
      setPreviewUrl(URL.createObjectURL(file));
      setStep('uploading');
      setUploadProgress(0);

      try {
        // Step 1: Get a presigned PUT URL from our API
        // Returns { videoId, uploadUrl } — no form fields, just a single PUT
        const { videoId: vid, uploadUrl } = await requestUpload.mutateAsync({
          filename: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
        });
        setVideoId(vid);

        // Step 2: PUT the raw file directly to R2 via the presigned URL.
        // Using XHR so we get upload progress events; fetch() doesn't expose them.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          // R2 presigned PUT requires Content-Type to match what was signed
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(file); // send the raw file — no FormData wrapper
        });

        // Step 3: Tell the API the PUT succeeded; it copies the file to the
        // served location and marks the video READY (MVP mode = instant).
        await confirmUpload.mutateAsync({ videoId: vid, mode: 'mvp' });

        setStep('metadata');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setUploadError(message);
        setStep('select');
        setPreviewUrl(null);
      }
    },
    [requestUpload, confirmUpload]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmitMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoId) return;

    await updateMetadata.mutateAsync({
      videoId,
      title: title.trim() || 'Untitled',
      description: description.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isPublic,
      isPremiumOnly,
    });
  };

  const resetForm = () => {
    setStep('select');
    setPreviewUrl(null);
    setVideoId(null);
    setTitle('');
    setDescription('');
    setTags('');
    setUploadProgress(0);
    setUploadError(null);
  };

  // Redirect unauthenticated users to sign-in (with return URL)
  useEffect(() => {
    if (isSignedIn === false) {
      router.push('/sign-in?redirect_url=/upload');
    }
  }, [isSignedIn, router]);

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <p className="text-white/50">Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-xl mx-auto pt-24 px-4 pb-16">
        <h1 className="text-2xl font-bold mb-8">Upload Video</h1>

        {/* ── Step: select file ── */}
        {step === 'select' && (
          <>
            {uploadError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-sm">
                {uploadError}
              </div>
            )}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                dragOver
                  ? 'border-pink-500 bg-pink-500/10'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <svg
                className="w-16 h-16 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div className="text-center">
                <p className="font-semibold">Drag & drop your video here</p>
                <p className="text-white/50 text-sm mt-1">or click to browse</p>
                <p className="text-white/30 text-xs mt-3">
                  MP4, MOV, WebM · 9:16 vertical · 15–60 seconds · max 500 MB
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </>
        )}

        {/* ── Step: uploading ── */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center gap-6">
            {previewUrl && (
              <video
                src={previewUrl}
                className="w-40 h-72 object-cover rounded-xl"
                muted
              />
            )}
            <div className="w-full">
              <div className="flex justify-between text-sm text-white/60 mb-2">
                <span>
                  {uploadProgress < 100 ? 'Uploading…' : 'Processing…'}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-500 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              {uploadProgress === 100 && (
                <p className="text-center text-white/40 text-xs mt-3">
                  Upload complete — confirming with server…
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step: metadata ── */}
        {step === 'metadata' && (
          <form onSubmit={handleSubmitMetadata} className="flex flex-col gap-5">
            {previewUrl && (
              <video
                src={previewUrl}
                className="w-40 h-72 object-cover rounded-xl mx-auto"
                muted
              />
            )}

            <div>
              <label className="block text-sm text-white/70 mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={100}
                placeholder="Give your video a title"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Tell viewers about your video…"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none focus:border-pink-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-1">
                Tags (comma-separated)
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="funny, dance, tutorial"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none focus:border-pink-500"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 accent-pink-500"
                />
                <span className="text-sm">Public</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPremiumOnly}
                  onChange={(e) => setIsPremiumOnly(e.target.checked)}
                  className="w-4 h-4 accent-pink-500"
                />
                <span className="text-sm">Premium only</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={updateMetadata.isPending}
              className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {updateMetadata.isPending ? 'Publishing…' : 'Publish Video'}
            </button>
          </form>
        )}

        {/* ── Step: done ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">Video published!</h2>
              <p className="text-white/50 text-sm mt-1">
                Your video is live and ready to watch.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="px-5 py-2 rounded-full border border-white/20 hover:border-white/40 text-sm transition-colors"
              >
                Upload another
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-5 py-2 rounded-full bg-pink-500 hover:bg-pink-600 text-sm font-semibold transition-colors"
              >
                Go to feed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
