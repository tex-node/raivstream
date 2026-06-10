import { useState } from "react";
import { Zap, Search, RefreshCw, XCircle, ExternalLink, ChevronRight, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const JOBS = [
  { id: "GEN-44892", user: "nova_creates", model: "Runway Gen-4", type: "video", status: "completed", credits: 55, prompt: "Dystopian city at night, neon rain, aerial drone shot, cinematic", provider_id: "rwai_job_882x21", output: "https://cdn.raivstream.io/out/gen-44892.mp4", created: "Jun 10, 10:42 AM" },
  { id: "GEN-44891", user: "vox_films", model: "Flux Ultra", type: "image", status: "completed", credits: 20, prompt: "Portrait of a wanderer in the desert at sunset, golden hour, film grain", provider_id: "fal_req_19x44a", output: "https://cdn.raivstream.io/out/gen-44891.jpg", created: "Jun 10, 10:38 AM" },
  { id: "GEN-44890", user: "synthwave_kai", model: "Kling v2 Pro", type: "video", status: "failed", credits: 0, prompt: "Synthwave landscape with flying cars and neon skyline", provider_id: "kling_err_404", output: null, created: "Jun 10, 10:31 AM" },
  { id: "GEN-44889", user: "luna.ai", model: "Flux Pro 1.1", type: "image", status: "generating", credits: 8, prompt: "Abstract geometric art, deep space, nebula colors, 4k", provider_id: "fal_req_20x81b", output: null, created: "Jun 10, 10:29 AM" },
  { id: "GEN-44888", user: "reel_creators", model: "SDXL Turbo", type: "image", status: "completed", credits: 3, prompt: "Minimal product photo, white background, levitating sneaker", provider_id: "fal_req_18x22c", output: "https://cdn.raivstream.io/out/gen-44888.jpg", created: "Jun 10, 10:20 AM" },
  { id: "GEN-44887", user: "nova_creates", model: "Flux Pro 1.1", type: "image", status: "rejected", credits: 0, prompt: "[FLAGGED - moderation]", provider_id: "—", output: null, created: "Jun 10, 10:11 AM" },
];

const statusStyle: Record<string, string> = {
  completed: "text-green-400 border-green-500/30 bg-green-500/10",
  failed: "text-destructive border-destructive/30 bg-destructive/10",
  generating: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  queued: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  rejected: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

export function AdminJobs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [drawer, setDrawer] = useState<typeof JOBS[0] | null>(null);

  const filtered = JOBS.filter(j => {
    const matchSearch = j.id.includes(search) || j.user.includes(search) || j.prompt.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchModel = modelFilter === "all" || j.model === modelFilter;
    return matchSearch && matchStatus && matchModel;
  });

  const models = [...new Set(JOBS.map(j => j.model))];

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h1 className="font-semibold">Admin — Generation Jobs</h1>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Job ID, user, or prompt..." className="pl-8 h-8 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["completed", "generating", "queued", "failed", "rejected"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6">
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Job ID", "User", "Model", "Type", "Status", "Credits", "Created", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => (
                  <tr
                    key={job.id}
                    className="hover:bg-white/3 transition-colors cursor-pointer"
                    onClick={() => setDrawer(job)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{job.id}</td>
                    <td className="px-4 py-3 text-xs">@{job.user}</td>
                    <td className="px-4 py-3 text-xs">{job.model}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{job.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${statusStyle[job.status]}`}>{job.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{job.credits > 0 ? job.credits : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{job.created}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={13} className="text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {drawer && (
        <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <span className="font-medium text-sm">Job Detail</span>
            <button onClick={() => setDrawer(null)} className="text-muted-foreground hover:text-foreground">
              <X size={15} />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              {[
                { label: "Job ID", value: drawer.id },
                { label: "User", value: `@${drawer.user}` },
                { label: "Model", value: drawer.model },
                { label: "Type", value: drawer.type },
                { label: "Provider Job ID", value: drawer.provider_id },
                { label: "Credits Used", value: drawer.credits > 0 ? String(drawer.credits) : "0 (failed)" },
                { label: "Created", value: drawer.created },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className="text-xs font-mono break-all">{item.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
              <Badge variant="outline" className={`text-[10px] ${statusStyle[drawer.status]}`}>{drawer.status}</Badge>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prompt</p>
              <p className="text-xs bg-muted/50 rounded p-2 leading-relaxed">{drawer.prompt}</p>
            </div>

            {drawer.output && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Output URL</p>
                <a href={drawer.output} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all">
                  <ExternalLink size={11} />{drawer.output}
                </a>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              {drawer.status === "failed" && (
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                  <RefreshCw size={11} />Retry Job
                </Button>
              )}
              {drawer.status === "generating" && (
                <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs">
                  <XCircle size={11} />Cancel Job
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
