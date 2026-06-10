import { Shield, Users, Film, Zap, Coins, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const MODEL_USAGE = [
  { model: "Flux Pro", jobs: 1840 },
  { model: "Flux Ultra", jobs: 620 },
  { model: "Kling v2", jobs: 490 },
  { model: "Runway Gen4", jobs: 380 },
  { model: "SDXL", jobs: 1100 },
  { model: "MiniMax", jobs: 210 },
];

const RECENT_JOBS = [
  { id: "GEN-44892", user: "nova_creates", model: "Runway Gen-4", status: "completed", credits: 55, time: "2m ago" },
  { id: "GEN-44891", user: "vox_films", model: "Flux Ultra", status: "completed", credits: 20, time: "4m ago" },
  { id: "GEN-44890", user: "synthwave_kai", model: "Kling v2 Pro", status: "failed", credits: 0, time: "6m ago" },
  { id: "GEN-44889", user: "luna.ai", model: "Flux Pro 1.1", status: "generating", credits: 8, time: "8m ago" },
  { id: "GEN-44888", user: "reel_creators", model: "SDXL Turbo", status: "completed", credits: 3, time: "12m ago" },
];

const statusColor: Record<string, string> = {
  completed: "bg-green-500/15 text-green-400 border-green-500/25",
  failed: "bg-red-500/15 text-destructive border-destructive/25",
  generating: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  queued: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border border-border rounded-md p-2.5 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-medium text-foreground">{p.value.toLocaleString()}</span></p>
        ))}
      </div>
    );
  }
  return null;
};

export function AdminOverview() {
  const stats = [
    { icon: Users, label: "Total Users", value: "14,821", delta: "+214 today", color: "text-primary bg-primary/10" },
    { icon: Film, label: "Total Videos", value: "88,402", delta: "+1,240 today", color: "text-[var(--brand-pink)] bg-[var(--brand-pink)]/10" },
    { icon: Zap, label: "Gen Jobs Today", value: "4,619", delta: "82% success rate", color: "text-[var(--brand-purple)] bg-[var(--brand-purple)]/10" },
    { icon: Coins, label: "Revenue (MTD)", value: "₦2.4M", delta: "+18% vs last month", color: "text-yellow-400 bg-yellow-500/10" },
    { icon: TrendingUp, label: "Credits In Circ.", value: "18.2M", delta: "Δ +120k today", color: "text-green-400 bg-green-500/10" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-primary" />
        <h1 className="font-semibold">Admin Overview</h1>
        <Badge variant="outline" className="ml-1 text-[10px]">Live</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-md p-4">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon size={14} />
            </div>
            <p className="text-lg font-semibold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            <p className="text-[10px] text-green-400 mt-0.5">{s.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Model usage */}
        <div className="bg-card border border-border rounded-md p-4">
          <h2 className="text-sm font-medium mb-4">Model Usage Today</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={MODEL_USAGE} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="model" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="jobs" name="Jobs" fill="var(--brand-cyan)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Moderation summary */}
        <div className="bg-card border border-border rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Moderation Queue</h2>
            <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30">14 pending</Badge>
          </div>
          <div className="space-y-2">
            {[
              { label: "Pending Review", count: 14, color: "bg-yellow-400" },
              { label: "Approved Today", count: 82, color: "bg-green-400" },
              { label: "Rejected Today", count: 7, color: "bg-red-400" },
              { label: "Flagged for Review", count: 3, color: "bg-orange-400" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
                <span className="text-sm flex-1">{item.label}</span>
                <span className="text-sm font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent jobs */}
      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-medium">Recent Generation Jobs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Job ID", "User", "Model", "Status", "Credits", "Time"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RECENT_JOBS.map(job => (
                <tr key={job.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{job.id}</td>
                  <td className="px-4 py-3 text-xs">@{job.user}</td>
                  <td className="px-4 py-3 text-xs">{job.model}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${statusColor[job.status]}`}>{job.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{job.credits > 0 ? job.credits : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{job.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
