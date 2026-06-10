import {
  Activity,
  Baby,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Coins,
  Compass,
  CreditCard,
  Film,
  Gift,
  Grid3X3,
  Image,
  Layers3,
  LayoutDashboard,
  Lock,
  Menu,
  MessageSquareText,
  MonitorPlay,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  User,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import logoSrc from "../imports/raivstream-logo.jpg";

type ScreenKey =
  | "feed"
  | "kids"
  | "studio"
  | "story"
  | "media"
  | "analytics"
  | "credits"
  | "admin"
  | "templates";

const navItems: Array<{ key: ScreenKey; label: string; icon: typeof Compass; group: string }> = [
  { key: "feed", label: "Main Feed", icon: Compass, group: "Experience" },
  { key: "kids", label: "R16 Kids", icon: Baby, group: "Experience" },
  { key: "studio", label: "AI Studio", icon: WandSparkles, group: "Creator" },
  { key: "story", label: "Story Studio", icon: BookOpen, group: "Creator" },
  { key: "media", label: "Media Library", icon: Grid3X3, group: "Creator" },
  { key: "analytics", label: "Analytics", icon: BarChart3, group: "Creator" },
  { key: "credits", label: "Credits", icon: Coins, group: "Commerce" },
  { key: "admin", label: "Admin Console", icon: ShieldCheck, group: "Operations" },
  { key: "templates", label: "Blank Templates", icon: Layers3, group: "System" },
];

const thumbnails = [
  "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80",
];

function Metric({ label, value, delta, icon: Icon }: { label: string; value: string; delta: string; icon: typeof Activity }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <Icon size={17} className="text-cyan-300" />
      </div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-emerald-300">{delta}</div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "cyan" | "green" | "amber" | "rose" }) {
  const tones = {
    neutral: "border-white/10 bg-white/5 text-slate-300",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-200",
  };

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function SectionHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{copy}</p>
      </div>
      {action && (
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.2)]">
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}

function Shell({ active, setActive }: { active: ScreenKey; setActive: (key: ScreenKey) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const grouped = useMemo(() => {
    return navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
      acc[item.group] = [...(acc[item.group] ?? []), item];
      return acc;
    }, {});
  }, []);

  const ActiveIcon = navItems.find((item) => item.key === active)?.icon ?? Compass;

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_34%),linear-gradient(135deg,rgba(124,58,237,0.11),transparent_42%)]" />
      {mobileOpen && <button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-[#0b0f16]/95 backdrop-blur-xl transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-white">
            <img src={logoSrc} alt="Raivstream" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Raivstream</div>
            <div className="text-xs text-slate-500">Video + AI creation OS</div>
          </div>
          <button className="ml-auto text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-5">
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">{group}</div>
              <div className="space-y-1">
                {items.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setActive(key);
                      setMobileOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${
                      active === key ? "bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-300/20" : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    {active === key && <ChevronRight size={15} className="ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="relative z-10 lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-[#080b10]/80 px-4 backdrop-blur-xl md:px-6">
          <button className="rounded-md border border-white/10 p-2 text-slate-300 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ActiveIcon size={17} className="text-cyan-300" />
            <span>{navItems.find((item) => item.key === active)?.label}</span>
          </div>
          <div className="ml-auto hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-400 md:flex">
            <Search size={16} />
            Search clips, creators, jobs
          </div>
          <button className="relative rounded-md border border-white/10 p-2 text-slate-300">
            <Bell size={17} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cyan-300" />
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-300 via-fuchsia-400 to-violet-500 text-xs font-bold text-white">TX</div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-6 md:px-6 lg:px-8">{renderScreen(active)}</main>
      </div>
    </div>
  );
}

function FeedScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-white/10 bg-black">
        <div className="relative mx-auto flex min-h-[calc(100vh-7rem)] max-w-[520px] items-center justify-center">
          <img src={thumbnails[1]} alt="Featured clip" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/80" />
          <div className="absolute left-4 top-4 flex gap-2">
            <Pill tone="cyan">For You</Pill>
            <Pill>Trending</Pill>
            <Pill>Viewers Pick</Pill>
          </div>
          <button className="relative grid h-16 w-16 place-items-center rounded-full bg-white/18 text-white backdrop-blur">
            <Play fill="currentColor" size={28} />
          </button>
          <div className="absolute bottom-5 left-5 right-20">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-8 w-8 rounded-full bg-cyan-300" />
              <span className="font-semibold text-white">@fothlog</span>
              <Pill tone="green">Creator</Pill>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-white">Neon market chase, Episode 04</h2>
            <p className="mt-2 text-sm leading-6 text-slate-200">A fast vertical sequence with AI-generated city plates, character continuity, and premium unlock controls.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span>#cinematic</span>
              <span>#aistory</span>
              <span>#wan26</span>
            </div>
          </div>
          <div className="absolute bottom-5 right-4 flex flex-col gap-3">
            {[Star, MessageSquareText, Gift, Lock].map((Icon, index) => (
              <button key={index} className="grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur">
                <Icon size={19} />
              </button>
            ))}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <Metric label="Episode Gate" value="5 / 10" delta="Premium lock preview active" icon={Lock} />
        <Metric label="Engagement" value="84.2%" delta="+12.8% this week" icon={Activity} />
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h3 className="font-semibold text-white">Media states</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {["Thumbnail", "Video fallback", "AI image", "Missing file"].map((label, index) => (
              <div key={label} className="aspect-[9/12] overflow-hidden rounded-md border border-white/10 bg-slate-900">
                {index < 3 ? <img src={thumbnails[index]} alt={label} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-500">Placeholder</div>}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function KidsScreen() {
  return (
    <div className="rounded-lg border border-emerald-300/20 bg-[#07150f] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Pill tone="green">R16 safe mode</Pill>
          <h1 className="mt-3 text-3xl font-semibold text-white">Kids Feed</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/70">A simplified feed for approved, kids-safe stories. Creation, upload, pricing, credits, settings, and admin routes are removed from this mode.</p>
        </div>
        <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">Approved content only</div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {["Learning adventures", "Music shorts", "Animated stories"].map((title, index) => (
          <div key={title} className="overflow-hidden rounded-lg border border-emerald-300/15 bg-white/[0.035]">
            <img src={thumbnails[index + 2]} alt={title} className="h-56 w-full object-cover" />
            <div className="p-4">
              <div className="flex items-center gap-2">
                <BadgeCheck size={16} className="text-emerald-300" />
                <span className="text-sm font-semibold text-white">{title}</span>
              </div>
              <p className="mt-2 text-sm text-emerald-100/60">Moderation approved, G-rated, safe for R16 feed.</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudioScreen() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="AI Studio" title="Generate images and video with credit-aware controls" copy="Prompt limits, model requirements, moderation, credit costs, seed images, job progress, and storyboard handoff are visible before generation." action="Generate" />
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-black/30 p-1">
            <button className="rounded bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950">Image</button>
            <button className="rounded px-3 py-2 text-sm text-slate-400">Video</button>
          </div>
          <label className="block text-sm text-slate-300">Model</label>
          <div className="rounded-md border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Flux.1 Dev</span>
              <Pill tone="cyan">80 credits</Pill>
            </div>
            <p className="mt-1 text-xs text-slate-500">Live image model, RunPod public endpoint</p>
          </div>
          <label className="block text-sm text-slate-300">Prompt</label>
          <textarea className="h-40 w-full resize-none rounded-md border border-white/10 bg-black/25 p-3 text-sm text-slate-200 outline-none" defaultValue="A young inventor crosses a rain-lit Lagos skyline bridge, cinematic lighting, expressive character continuity, vertical composition." />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Moderation scan before credit deduction</span>
            <span>183 / 2000</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["9:16", "1:1", "16:9"].map((item) => <button key={item} className="rounded-md border border-white/10 bg-white/5 py-2 text-sm text-slate-300">{item}</button>)}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="relative min-h-[520px] overflow-hidden rounded-md bg-black">
              <img src={thumbnails[4]} alt="AI output" className="h-full min-h-[520px] w-full object-cover opacity-90" />
              <div className="absolute left-4 top-4 flex gap-2">
                <Pill tone="green">Completed</Pill>
                <Pill>Saved to storyboard shot 06</Pill>
              </div>
            </div>
            <div className="space-y-3">
              {["Queued", "Generating", "Mirrored to R2", "Ready to publish"].map((step, index) => (
                <div key={step} className="flex gap-3 rounded-md border border-white/10 bg-black/20 p-3">
                  <CheckCircle2 size={17} className={index < 3 ? "text-emerald-300" : "text-cyan-300"} />
                  <div>
                    <div className="text-sm font-medium text-white">{step}</div>
                    <div className="text-xs text-slate-500">{index === 1 ? "Wan / Seedance slow models poll every 10s" : "Provider and app state aligned"}</div>
                  </div>
                </div>
              ))}
              <button className="w-full rounded-md bg-cyan-300 py-2.5 text-sm font-semibold text-slate-950">Publish to feed</button>
              <button className="w-full rounded-md border border-white/10 py-2.5 text-sm font-semibold text-slate-200">Use as shot reference</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryScreen() {
  const shots = ["Opening frame", "Character action", "Environment reveal", "Camera move", "Video prompt"];
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Story Studio" title="Build stories into reusable generation prompts" copy="Create projects, characters, environments, storyboard shots, image prompts, video prompts, and saved asset references for downstream video generation." action="New project" />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h3 className="font-semibold text-white">Project script</h3>
          <textarea className="mt-4 h-80 w-full resize-none rounded-md border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-300 outline-none" defaultValue="Volume 1: An inventor discovers a buried signal under the city and builds a machine that can turn memories into short films..." />
          <button className="mt-3 w-full rounded-md bg-cyan-300 py-2.5 text-sm font-semibold text-slate-950">Break into shots</button>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Storyboard</h3>
            <Pill tone="cyan">24-shot max</Pill>
          </div>
          <div className="mt-4 space-y-3">
            {shots.map((shot, index) => (
              <div key={shot} className="grid gap-3 rounded-md border border-white/10 bg-black/20 p-3 md:grid-cols-[88px_minmax(0,1fr)]">
                <div className="aspect-video overflow-hidden rounded bg-slate-900">
                  <img src={thumbnails[index % thumbnails.length]} alt={shot} className="h-full w-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Shot {String(index + 1).padStart(2, "0")}</span>
                    <Pill>{shot}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">Compiled image and video prompt are clipped to generation limits and ready for AI Studio handoff.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {["Characters", "Environments", "References"].map((title, index) => (
            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{title}</h3>
                <Plus size={16} className="text-cyan-300" />
              </div>
              <p className="mt-2 text-sm text-slate-500">{index === 0 ? "Appearance, wardrobe, voice, traits." : index === 1 ? "Locations, lighting, mood, era." : "Generated assets attached to shots."}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MediaScreen() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Creator Library" title="Media library with reliable thumbnail fallbacks" copy="Generated images, uploaded videos, published shorts, and missing thumbnail states share a consistent grid pattern." action="Upload media" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
            <div className="relative aspect-[9/12] bg-slate-900">
              {index === 7 ? (
                <div className="grid h-full place-items-center text-center text-sm text-slate-500">
                  <div>
                    <Image className="mx-auto mb-2" />
                    Missing thumbnail
                  </div>
                </div>
              ) : (
                <img src={thumbnails[index % thumbnails.length]} alt="Media" className="h-full w-full object-cover" />
              )}
              <Pill tone={index % 3 === 0 ? "green" : "neutral"}>{index % 3 === 0 ? "Published" : "Draft"}</Pill>
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold text-white">Storyboard render {index + 1}</div>
              <div className="mt-1 text-xs text-slate-500">Video fallback available</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsScreen() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Creator Analytics" title="Performance, watch time, credits, and revenue" copy="A compact creator workspace for repeated analysis and monetization decisions." />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Views" value="1.24M" delta="+18.4%" icon={MonitorPlay} />
        <Metric label="Watch hours" value="8,940" delta="+9.1%" icon={Clock3} />
        <Metric label="Followers" value="42.8K" delta="+2,103" icon={User} />
        <Metric label="Revenue" value="₦826K" delta="+14.7%" icon={CreditCard} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Views trend</h3>
          <div className="mt-6 flex h-64 items-end gap-2">
            {[42, 55, 34, 72, 88, 64, 96, 76, 110, 92, 128, 145].map((height, index) => (
              <div key={index} className="flex-1 rounded-t bg-cyan-300/70" style={{ height }} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Top content</h3>
          <div className="mt-4 space-y-3">
            {["Neon market chase", "Learning with Ada", "Lost satellite signal"].map((title, index) => (
              <div key={title} className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 p-3">
                <img src={thumbnails[index]} alt={title} className="h-14 w-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{title}</div>
                  <div className="text-xs text-slate-500">{(index + 4) * 18}K views</div>
                </div>
                <Star size={16} className="text-amber-300" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditsScreen() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Credits" title="Credit balance, packages, and ledger" copy="Credits support AI generation, manual admin gifts, refunds, purchases, and usage history." action="Buy credits" />
      <div className="grid gap-4 lg:grid-cols-3">
        {["Starter", "Popular", "Pro"].map((name, index) => (
          <div key={name} className={`rounded-lg border p-5 ${index === 1 ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/[0.035]"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">{name}</h3>
              {index === 1 && <Pill tone="cyan">Best value</Pill>}
            </div>
            <div className="mt-5 text-3xl font-semibold text-white">{[1000, 5000, 10000][index].toLocaleString()}</div>
            <div className="text-sm text-slate-500">AI credits</div>
            <button className="mt-5 w-full rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">Purchase</button>
          </div>
        ))}
      </div>
      <LedgerTable />
    </div>
  );
}

function LedgerTable() {
  const rows = [
    ["BONUS", "+5,000", "Manual gift", "manual-gift-2026-05-25"],
    ["USAGE", "-80", "Flux generation", "job_cmnp"],
    ["REFUND", "+200", "Provider failure", "support-1421"],
    ["PURCHASE", "+10,000", "Paystack credit pack", "paystack_ref"],
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
      <div className="grid grid-cols-4 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>Type</span>
        <span>Amount</span>
        <span>Description</span>
        <span>Reference</span>
      </div>
      {rows.map((row) => (
        <div key={row.join("-")} className="grid grid-cols-4 border-b border-white/5 px-4 py-3 text-sm text-slate-300 last:border-0">
          <span>{row[0]}</span>
          <span className={row[1].startsWith("+") ? "text-emerald-300" : "text-rose-300"}>{row[1]}</span>
          <span>{row[2]}</span>
          <span className="truncate text-slate-500">{row[3]}</span>
        </div>
      ))}
    </div>
  );
}

function AdminScreen() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Admin Console" title="Operational controls for users, credits, moderation, and jobs" copy="A dense admin workspace that favors tables, filters, auditability, and fast review." />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Users" value="18,204" delta="+221 today" icon={User} />
        <Metric label="Jobs" value="7,812" delta="93 queued" icon={Sparkles} />
        <Metric label="Credits" value="4.8M" delta="In circulation" icon={Coins} />
        <Metric label="Moderation" value="42" delta="Needs review" icon={ShieldCheck} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Manual Credits / Coupons</h3>
            <Pill tone="cyan">Admin only</Pill>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {["User email, username, or ID", "Credits", "Reason", "Coupon / reference ID"].map((label) => (
              <div key={label}>
                <label className="text-xs text-slate-500">{label}</label>
                <div className="mt-1 rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-slate-400">{label === "Credits" ? "5,000" : label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Gift / coupon</button>
            <button className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300">Refund</button>
            <button className="rounded-md border border-rose-300/25 px-4 py-2 text-sm text-rose-200">Deduct</button>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Moderation queue</h3>
          <div className="mt-4 space-y-3">
            {["Pending scan", "Flagged image", "Kids-safe review"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 p-3">
                <img src={thumbnails[index + 1]} alt={item} className="h-12 w-12 rounded object-cover" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{item}</div>
                  <div className="text-xs text-slate-500">Approve, reject, flag, rate, mark kids-safe</div>
                </div>
                <Pill tone={index === 1 ? "rose" : "amber"}>{index === 1 ? "Flagged" : "Pending"}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
      <LedgerTable />
    </div>
  );
}

function TemplatesScreen() {
  const templates = [
    ["Blank Dashboard", LayoutDashboard, "Stats row, content band, empty/loading/error states."],
    ["CRUD Management", Grid3X3, "Search, filters, table, add/edit modal, pagination."],
    ["Creator Tool", WandSparkles, "Left settings, center preview, right inspector."],
    ["Media Library", Film, "Toolbar, grid, thumbnail states, bulk actions."],
    ["Workflow Wizard", Clapperboard, "Stepper, review screen, success state."],
    ["Admin Settings", Settings, "Sectioned controls, save bar, audit trail."],
    ["Detail Page", Layers3, "Entity header, metadata sidebar, activity log."],
    ["Mobile Screen", MonitorPlay, "Header, content, bottom nav, floating action."],
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Future-ready templates" title="Reusable blank screens for new Raivstream features" copy="Each template keeps the same navigation, spacing, table, form, and empty-state language so future modules can ship without redesigning the shell." action="Duplicate template" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {templates.map(([title, Icon, copy]) => (
          <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-cyan-300/10 text-cyan-200">
              <Icon size={20} />
            </div>
            <h3 className="mt-4 font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
            <div className="mt-5 rounded-md border border-dashed border-white/12 p-4">
              <div className="h-2 w-2/3 rounded bg-white/15" />
              <div className="mt-3 h-16 rounded bg-white/[0.04]" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="h-8 rounded bg-white/[0.06]" />
                <div className="h-8 rounded bg-white/[0.06]" />
                <div className="h-8 rounded bg-white/[0.06]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderScreen(active: ScreenKey) {
  switch (active) {
    case "feed":
      return <FeedScreen />;
    case "kids":
      return <KidsScreen />;
    case "studio":
      return <StudioScreen />;
    case "story":
      return <StoryScreen />;
    case "media":
      return <MediaScreen />;
    case "analytics":
      return <AnalyticsScreen />;
    case "credits":
      return <CreditsScreen />;
    case "admin":
      return <AdminScreen />;
    case "templates":
      return <TemplatesScreen />;
    default:
      return <FeedScreen />;
  }
}

export default function App() {
  const [active, setActive] = useState<ScreenKey>("feed");
  return <Shell active={active} setActive={setActive} />;
}
