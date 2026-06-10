import { useState } from "react";
import { Search, TrendingUp, Sparkles, Film, X } from "lucide-react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

const TRENDING = ["#AIArt", "#CyberPunk", "#FluxPro", "#StoryStudio", "#NeonCity", "#LoFi", "#CinematicAI", "#SciFi"];

const RESULTS = [
  { id: 1, thumb: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=200&h=280&fit=crop&auto=format", creator: "nova_creates", title: "Neon City Dreams", type: "video" },
  { id: 2, thumb: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=200&h=280&fit=crop&auto=format", creator: "synthwave_kai", title: "Retrowave Nights", type: "ai" },
  { id: 3, thumb: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&h=280&fit=crop&auto=format", creator: "vox_films", title: "Desert Horizon", type: "video" },
  { id: 4, thumb: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=200&h=280&fit=crop&auto=format", creator: "luna.ai", title: "Liquid Geometry", type: "ai" },
  { id: 5, thumb: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=200&h=280&fit=crop&auto=format", creator: "nova_creates", title: "Purple Haze Vol. 3", type: "ai" },
  { id: 6, thumb: "https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=200&h=280&fit=crop&auto=format", creator: "reel_creators", title: "Urban Pulse", type: "video" },
];

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Search size={16} className="text-primary" />
        <h1 className="font-semibold">Search</h1>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && setSearched(true)}
          placeholder="Search videos, creators, tags..."
          className="pl-10 h-10 text-sm pr-8"
        />
        {query && (
          <button onClick={() => { setQuery(""); setSearched(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {!searched ? (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-[var(--brand-pink)]" />
              <h2 className="text-sm font-medium">Trending Tags</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {TRENDING.map(tag => (
                <button
                  key={tag}
                  onClick={() => { setQuery(tag); setSearched(true); }}
                  className="text-sm px-3 py-1 rounded-full bg-card border border-border hover:border-primary/40 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-primary" />
              <h2 className="text-sm font-medium">Featured Creators</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["nova_creates", "vox_films", "synthwave_kai", "luna.ai"].map((c, i) => (
                <div key={c} className="bg-card border border-border rounded-md p-3 flex items-center gap-2.5 hover:border-primary/30 transition-colors cursor-pointer">
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold`}
                    style={{ background: `linear-gradient(135deg, var(--brand-${["pink", "purple", "cyan", "pink"][i]}), var(--brand-${["purple", "cyan", "pink", "cyan"][i]}))` }}>
                    {c[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">@{c}</p>
                    <p className="text-[10px] text-muted-foreground">Creator</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Results for <span className="text-foreground font-medium">"{query}"</span> — {RESULTS.length} found
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {RESULTS.map(r => (
              <div key={r.id} className="relative aspect-[3/4] rounded-md overflow-hidden bg-muted cursor-pointer group">
                <img src={r.thumb} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                  <p className="text-white text-[10px] font-medium line-clamp-2">{r.title}</p>
                  <p className="text-white/60 text-[9px]">@{r.creator}</p>
                </div>
                {r.type === "ai" && <Sparkles size={9} className="absolute top-1.5 right-1.5 text-primary" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
