import { useState } from "react";
import { Heart, Star, Share2, Play, Shield } from "lucide-react";

const KIDS_VIDEOS = [
  {
    id: 1,
    creator: "funtime_crew",
    title: "Ocean Friends — Animated",
    description: "Join Finn the fish on a magical underwater adventure!",
    tags: ["#Animals", "#Ocean", "#Adventure"],
    likes: 2100,
    rating: 4.9,
    thumbnail: "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=400&h=700&fit=crop&auto=format",
  },
  {
    id: 2,
    creator: "color_world",
    title: "Rainbow Shapes Dance",
    description: "Learn colors and shapes with fun animated characters.",
    tags: ["#Learning", "#Colors", "#Educational"],
    likes: 3400,
    rating: 4.8,
    thumbnail: "https://images.unsplash.com/photo-1560762484-813fc97650a0?w=400&h=700&fit=crop&auto=format",
  },
];

export function R16KidsFeed() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const video = KIDS_VIDEOS[currentIndex % KIDS_VIDEOS.length];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--kids-bg)" }}>
      {/* Kids-safe indicator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--kids-primary)20" }}>
        <Shield size={14} style={{ color: "var(--kids-primary)" }} />
        <span className="text-xs" style={{ color: "var(--kids-primary)" }}>Kids-Safe Content Only</span>
        <span className="ml-auto text-xs text-muted-foreground">Kids Feed</span>
      </div>

      {/* Video area */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--kids-primary)33", border: "2px solid var(--kids-primary)" }}>
            <Play size={24} style={{ color: "var(--kids-primary)" }} className="ml-1" />
          </div>
        </div>

        {/* Kids-safe badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "var(--kids-primary)22", color: "var(--kids-primary)", border: "1px solid var(--kids-primary)44" }}>
          <Shield size={11} />
          Approved for Kids
        </div>

        {/* Right actions */}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-20">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "linear-gradient(135deg, var(--kids-primary), var(--kids-accent))" }}>
            {video.creator[0].toUpperCase()}
          </div>
          <button onClick={() => setLiked(l => !l)} className="flex flex-col items-center gap-1">
            <Heart size={24}
              className={liked ? "fill-current" : ""}
              style={{ color: liked ? "var(--kids-primary)" : "white" }}
            />
            <span className="text-xs text-white">{(video.likes + (liked ? 1 : 0)).toLocaleString()}</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <Star size={22} style={{ color: "var(--kids-accent)" }} className="fill-current" />
            <span className="text-xs text-white">{video.rating}</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <Share2 size={22} className="text-white" />
          </button>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-4 left-3 right-16 z-20">
          <p className="text-white text-xs mb-1" style={{ color: "var(--kids-primary)" }}>@{video.creator}</p>
          <p className="text-white font-semibold text-sm mb-1">{video.title}</p>
          <p className="text-white/70 text-xs mb-2">{video.description}</p>
          <div className="flex gap-1">
            {video.tags.map(tag => (
              <span key={tag} className="text-xs" style={{ color: "var(--kids-accent)" }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-t" style={{ borderColor: "var(--kids-primary)20" }}>
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          className="px-4 py-1.5 rounded-full text-sm font-medium"
          style={{ background: "var(--kids-primary)22", color: "var(--kids-primary)" }}
        >
          ← Prev
        </button>
        <span className="text-xs text-muted-foreground">{currentIndex + 1} / {KIDS_VIDEOS.length}</span>
        <button
          onClick={() => setCurrentIndex(i => i + 1)}
          className="px-4 py-1.5 rounded-full text-sm font-medium"
          style={{ background: "var(--kids-primary)22", color: "var(--kids-primary)" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
