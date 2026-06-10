import { BarChart2, TrendingUp, Eye, Users, Clock, Coins, ChevronDown } from "lucide-react";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const VIEW_DATA = [
  { date: "Jun 1", views: 1200, followers: 80 },
  { date: "Jun 3", views: 1900, followers: 105 },
  { date: "Jun 5", views: 3100, followers: 140 },
  { date: "Jun 7", views: 2600, followers: 92 },
  { date: "Jun 9", views: 4800, followers: 220 },
  { date: "Jun 11", views: 4200, followers: 180 },
  { date: "Jun 13", views: 5900, followers: 310 },
  { date: "Jun 15", views: 8100, followers: 480 },
  { date: "Jun 17", views: 7200, followers: 360 },
  { date: "Jun 19", views: 9400, followers: 540 },
  { date: "Jun 21", views: 11200, followers: 720 },
  { date: "Jun 23", views: 10100, followers: 610 },
];

const TOP_VIDEOS = [
  { title: "Neon Cityscapes — AI Generated", views: "41.2k", likes: 4821, watchTime: "3:24", revenue: "₦8,400" },
  { title: "Desert Storm — Cinematic", views: "33.8k", likes: 3102, watchTime: "2:58", revenue: "₦6,100" },
  { title: "Retrowave Dreamscape", views: "18.7k", likes: 2044, watchTime: "1:47", revenue: "₦3,200" },
  { title: "Future City Vol 2", views: "12.1k", likes: 1389, watchTime: "2:15", revenue: "₦2,800" },
];

function StatCard({ icon: Icon, label, value, delta, color }: {
  icon: React.ComponentType<{size?: number; className?: string}>; label: string; value: string; delta: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="text-xl font-semibold mb-1">{value}</p>
      <p className="text-xs text-green-400">{delta}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border border-border rounded-md p-2.5 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="text-foreground font-medium">{p.value.toLocaleString()}</span></p>
        ))}
      </div>
    );
  }
  return null;
};

export function Analytics() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-primary" />
          <h1 className="font-semibold">Analytics</h1>
        </div>
        <Select defaultValue="30d">
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Eye} label="Total Views" value="131.2k" delta="+18.4% vs last period" color="bg-primary/10 text-primary" />
        <StatCard icon={Users} label="New Followers" value="2,841" delta="+31.2% vs last period" color="bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]" />
        <StatCard icon={Clock} label="Watch Hours" value="1,204h" delta="+12.7% vs last period" color="bg-[var(--brand-purple)]/10 text-[var(--brand-purple)]" />
        <StatCard icon={Coins} label="Revenue" value="₦48,200" delta="+22.1% vs last period" color="bg-yellow-500/10 text-yellow-400" />
      </div>

      {/* Views chart */}
      <div className="bg-card border border-border rounded-md p-4">
        <h2 className="text-sm font-medium mb-4">Views & Followers</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={VIEW_DATA}>
            <defs>
              <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-cyan)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--brand-cyan)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gFollowers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-pink)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--brand-pink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="views" name="Views" stroke="var(--brand-cyan)" fill="url(#gViews)" strokeWidth={1.5} />
            <Area type="monotone" dataKey="followers" name="Followers" stroke="var(--brand-pink)" fill="url(#gFollowers)" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top videos */}
      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-medium">Top Videos</h2>
        </div>
        <div className="divide-y divide-border">
          {TOP_VIDEOS.map((v, i) => (
            <div key={v.title} className="flex items-center gap-4 px-4 py-3">
              <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{v.title}</p>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-xs text-muted-foreground shrink-0">
                <span>{v.views}</span>
                <span>♥ {v.likes.toLocaleString()}</span>
                <span>~{v.watchTime}</span>
                <span className="text-foreground font-medium">{v.revenue}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
