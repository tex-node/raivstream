import { useState, useRef } from "react";
import {
  Heart, ThumbsDown, Star, Share2, UserPlus, Volume2, VolumeX,
  Lock, Play, Pause, ChevronUp, ChevronDown, MoreHorizontal
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const TABS = ["For You", "Trending", "Viewers Pick", "Following"];

const VIDEOS = [
  {
    id: 1,
    creator: "nova_creates",
    displayName: "Nova Creates",
    title: "Neon Cityscapes — AI Generated",
    description: "Exploring AI-generated urban futures with Raivstream's new diffusion model. Every frame is unique.",
    tags: ["#AIArt", "#CityScapes", "#Futurism"],
    likes: 4821,
    stars: 3.8,
    thumbnail: "https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=400&h=700&fit=crop&auto=format",
    avatarColor: "from-[var(--brand-pink)] to-[var(--brand-purple)]",
    isPremium: false,
    isLandscape: false,
  },
  {
    id: 2,
    creator: "vox_films",
    displayName: "Vox Films",
    title: "Desert Storm — Cinematic Short",
    description: "A 90-second cinematic piece shot with AI enhancement tools. Story Studio workflow inside.",
    tags: ["#Cinematic", "#StoryStudio", "#Desert"],
    likes: 12043,
    stars: 4.7,
    thumbnail: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=700&fit=crop&auto=format",
    avatarColor: "from-[var(--brand-purple)] to-[var(--brand-cyan)]",
    isPremium: true,
    isLandscape: false,
  },
  {
    id: 3,
    creator: "synthwave_kai",
    displayName: "Synthwave Kai",
    title: "Retrowave Dreamscape",
    description: "Generated with Flux Pro + custom style prompts. Full prompt in comments.",
    tags: ["#Synthwave", "#Retrowave", "#FluxPro"],
    likes: 7622,
    stars: 4.2,
    thumbnail: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400&h=700&fit=crop&auto=format",
    avatarColor: "from-[var(--brand-cyan)] to-[var(--brand-pink)]",
    isPremium: false,
    isLandscape: true,
  },
];

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function FeedCard({ video, isActive }: { video: typeof VIDEOS[0]; isActive: boolean }) {
  const [liked, setLiked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(isActive);
  const [starRating, setStarRating] = useState(0);
  const [followed, setFollowed] = useState(false);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Background / thumbnail */}
      {video.isLandscape ? (
        <>
          <div
            className="absolute inset-0 scale-110 blur-2xl opacity-60"
            style={{ backgroundImage: `url(${video.thumbnail})`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <img src={video.thumbnail} alt={video.title} className="relative z-10 max-h-full max-w-full object-contain" />
        </>
      ) : (
        <img src={video.thumbnail} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Dark gradient bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Premium lock overlay */}
      {video.isPremium && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20">
          <div className="bg-card/90 border border-border rounded-lg p-6 text-center max-w-[260px]">
            <Lock className="mx-auto mb-3 text-primary" size={28} />
            <p className="font-semibold mb-1">Premium Content</p>
            <p className="text-xs text-muted-foreground mb-4">Subscribe to unlock all creator content</p>
            <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Unlock — ₦2,500/mo</Button>
          </div>
        </div>
      )}

      {/* Play/pause tap zone */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={() => setPlaying(p => !p)}
      />

      {/* Play indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
            <Play size={22} className="text-white ml-1" />
          </div>
        </div>
      )}

      {/* Right action rail */}
      <div className="absolute right-3 bottom-28 z-30 flex flex-col items-center gap-4">
        {/* Avatar */}
        <div className="relative">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${video.avatarColor} flex items-center justify-center text-white text-sm font-semibold`}>
            {video.displayName[0]}
          </div>
          <button
            onClick={() => setFollowed(f => !f)}
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-colors
              ${followed ? "bg-muted-foreground" : "bg-primary"}`}
          >
            {followed ? <span className="text-[10px] text-white">✓</span> : <span className="text-[10px] text-primary-foreground">+</span>}
          </button>
        </div>

        {/* Like */}
        <button onClick={() => setLiked(l => !l)} className="flex flex-col items-center gap-1">
          <Heart size={24} className={liked ? "text-[var(--brand-pink)] fill-[var(--brand-pink)]" : "text-white"} />
          <span className="text-[11px] text-white">{formatCount(video.likes + (liked ? 1 : 0))}</span>
        </button>

        {/* Dislike */}
        <button className="flex flex-col items-center gap-1">
          <ThumbsDown size={22} className="text-white" />
        </button>

        {/* Star rating */}
        <button className="flex flex-col items-center gap-1">
          <Star size={22} className={starRating > 0 ? "text-[var(--brand-cyan)] fill-[var(--brand-cyan)]" : "text-white"} />
          <span className="text-[11px] text-white">{video.stars}</span>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-1">
          <Share2 size={22} className="text-white" />
        </button>

        {/* Mute */}
        <button onClick={() => setMuted(m => !m)} className="flex flex-col items-center gap-1">
          {muted ? <VolumeX size={22} className="text-white" /> : <Volume2 size={22} className="text-white" />}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-16 left-3 right-16 z-30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-semibold text-sm">@{video.creator}</span>
          {!followed && (
            <button
              onClick={() => setFollowed(true)}
              className="text-[11px] border border-white/40 text-white px-2 py-0.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Follow
            </button>
          )}
        </div>
        <p className="text-white text-sm font-medium mb-1 line-clamp-2">{video.title}</p>
        <p className="text-white/70 text-xs mb-2 line-clamp-2">{video.description}</p>
        <div className="flex flex-wrap gap-1">
          {video.tags.map(tag => (
            <span key={tag} className="text-[var(--brand-cyan)] text-xs">{tag}</span>
          ))}
        </div>
      </div>

      {/* Guest CTA */}
      <div className="absolute top-3 right-3 z-30">
        <Button size="sm" variant="outline" className="h-7 text-xs bg-black/40 border-white/20 text-white hover:bg-white/10 backdrop-blur-sm">
          Sign up free
        </Button>
      </div>
    </div>
  );
}

export function HomeFeed() {
  const [activeTab, setActiveTab] = useState("For You");
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <div className="h-screen w-full flex flex-col bg-black overflow-hidden">
      {/* Feed tabs */}
      <div className="absolute top-0 left-0 right-0 z-40 flex justify-center pt-3 pb-1 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded-full transition-colors
                ${activeTab === tab
                  ? "bg-white/15 text-white font-medium border border-white/20"
                  : "text-white/60 hover:text-white/90"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Video container */}
      <div className="relative flex-1 overflow-hidden">
        <FeedCard video={VIDEOS[currentIndex % VIDEOS.length]} isActive={true} />
      </div>

      {/* Navigation arrows (desktop) */}
      <div className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-2">
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => setCurrentIndex(i => i + 1)}
          className="w-9 h-9 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Progress dots */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 lg:hidden flex flex-col gap-1.5">
        {VIDEOS.map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all ${i === currentIndex % VIDEOS.length ? "h-5 bg-white" : "h-1.5 bg-white/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
