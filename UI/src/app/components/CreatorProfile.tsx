import { useState } from "react";
import { UserPlus, Grid, Sparkles, Heart, Play, Image as ImageIcon, Film, MoreHorizontal, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Badge } from "./ui/badge";

const MEDIA = [
  { id: 1, type: "video", thumb: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=300&h=400&fit=crop&auto=format", views: "24k", duration: "0:48" },
  { id: 2, type: "ai", thumb: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=300&h=400&fit=crop&auto=format", views: "18k", duration: null },
  { id: 3, type: "video", thumb: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&h=400&fit=crop&auto=format", views: "41k", duration: "1:12" },
  { id: 4, type: "ai", thumb: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=300&h=400&fit=crop&auto=format", views: "9.2k", duration: null },
  { id: 5, type: "video", thumb: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=400&fit=crop&auto=format", views: "33k", duration: "0:55" },
  { id: 6, type: "ai", thumb: null, views: "—", duration: null },
  { id: 7, type: "video", thumb: "https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=300&h=400&fit=crop&auto=format", views: "12k", duration: "2:04" },
  { id: 8, type: "ai", thumb: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=300&h=400&fit=crop&auto=format", views: "7.4k", duration: null },
];

function MediaCard({ item }: { item: typeof MEDIA[0] }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative aspect-[3/4] rounded-md overflow-hidden bg-muted cursor-pointer group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {item.thumb
        ? <img src={item.thumb} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300" />
        : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
            {item.type === "video" ? <Film size={24} /> : <ImageIcon size={24} />}
            <span className="text-[10px] mt-1">No thumbnail</span>
          </div>
        )
      }
      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
        <Play size={20} className="text-white" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-[10px]">{item.views} views</span>
          {item.duration && <span className="text-white/70 text-[10px]">{item.duration}</span>}
          {item.type === "ai" && <Sparkles size={10} className="text-primary" />}
        </div>
      </div>
    </div>
  );
}

export function CreatorProfile() {
  const [followed, setFollowed] = useState(false);
  const [tab, setTab] = useState("videos");

  const videoItems = MEDIA.filter(m => m.type === "video");
  const aiItems = MEDIA.filter(m => m.type === "ai");

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header banner */}
      <div className="h-40 bg-gradient-to-r from-[var(--brand-pink)]/20 via-[var(--brand-purple)]/20 to-[var(--brand-cyan)]/20 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=1200&h=300&fit=crop&auto=format"
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
      </div>

      {/* Profile info */}
      <div className="px-6 pb-4">
        <div className="flex items-end justify-between -mt-10 mb-4">
          <div className="w-20 h-20 rounded-full border-4 border-background bg-gradient-to-br from-[var(--brand-pink)] via-[var(--brand-purple)] to-[var(--brand-cyan)] flex items-center justify-center text-white text-2xl font-bold">
            N
          </div>
          <Button
            size="sm"
            variant={followed ? "outline" : "default"}
            onClick={() => setFollowed(f => !f)}
            className="gap-1.5 mb-1"
          >
            {followed ? <><Check size={13} />Following</> : <><UserPlus size={13} />Follow</>}
          </Button>
        </div>

        <div className="mb-4">
          <h1 className="font-semibold mb-0.5">Nova Creates</h1>
          <p className="text-sm text-muted-foreground mb-2">@nova_creates</p>
          <p className="text-sm text-muted-foreground max-w-md">
            AI-first filmmaker & visual storyteller. Exploring the edge of generative cinema with Raivstream.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="secondary" className="text-[10px]">Creator</Badge>
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Verified</Badge>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 border-y border-border py-3 mb-4">
          {[
            { label: "Followers", value: "84.2k" },
            { label: "Following", value: "312" },
            { label: "Videos", value: "47" },
            { label: "Watch Hours", value: "1.2M" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="font-semibold text-sm">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-transparent p-0 gap-0 border-b border-border w-full justify-start mb-4">
            {[
              { value: "videos", label: "Videos", count: videoItems.length },
              { value: "ai", label: "AI Generations", count: aiItems.length },
              { value: "liked", label: "Liked" },
            ].map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3 h-9"
              >
                {t.label}{t.count !== undefined && <span className="ml-1 text-muted-foreground">({t.count})</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="videos" className="m-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {videoItems.map(item => <MediaCard key={item.id} item={item} />)}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="m-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {aiItems.map(item => <MediaCard key={item.id} item={item} />)}
            </div>
          </TabsContent>

          <TabsContent value="liked" className="m-0">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Heart size={32} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Liked content is private</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
