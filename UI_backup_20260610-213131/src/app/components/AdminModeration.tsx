import { useState } from "react";
import { Shield, Check, X, Flag, Baby, Eye } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";

const QUEUE = [
  {
    id: 1, creator: "nova_creates", title: "Neon Underworld Vol 2", flags: ["Potential violence", "AI-generated"],
    thumb: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=200&h=280&fit=crop&auto=format",
    rating: null, kidsSafe: false, status: "pending", submitted: "10m ago"
  },
  {
    id: 2, creator: "unknown_user42", title: "Explicit Content TEST", flags: ["Explicit language", "NSFW risk", "Spam"],
    thumb: null,
    rating: null, kidsSafe: false, status: "pending", submitted: "25m ago"
  },
  {
    id: 3, creator: "color_world", title: "Rainbow Learning — Episode 7", flags: ["Kids content review"],
    thumb: "https://images.unsplash.com/photo-1560762484-813fc97650a0?w=200&h=280&fit=crop&auto=format",
    rating: "G", kidsSafe: true, status: "pending", submitted: "1h ago"
  },
];

type ItemStatus = "pending" | "approved" | "rejected" | "flagged";
const statusStyle: Record<ItemStatus, string> = {
  pending: "text-yellow-400 border-yellow-500/30",
  approved: "text-green-400 border-green-500/30",
  rejected: "text-destructive border-destructive/30",
  flagged: "text-orange-400 border-orange-500/30",
};

export function AdminModeration() {
  const [items, setItems] = useState(QUEUE.map(q => ({ ...q, localRating: q.rating || "pg13", localKids: q.kidsSafe, reason: "" })));
  const [preview, setPreview] = useState<typeof items[0] | null>(null);
  const [statuses, setStatuses] = useState<Record<number, ItemStatus>>({});

  function setStatus(id: number, status: ItemStatus) {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-primary" />
        <h1 className="font-semibold">Admin — Moderation</h1>
        <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30">{QUEUE.length} in queue</Badge>
      </div>

      <div className="space-y-3">
        {items.map(item => {
          const status = statuses[item.id] as ItemStatus || "pending";
          return (
            <div key={item.id} className="bg-card border border-border rounded-md overflow-hidden">
              <div className="flex gap-4 p-4">
                {/* Thumb */}
                <div className="w-20 shrink-0 aspect-[3/4] rounded bg-muted overflow-hidden">
                  {item.thumb
                    ? <img src={item.thumb} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-[10px]">No thumb</div>
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">@{item.creator} · {item.submitted}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${statusStyle[status]}`}>{status}</Badge>
                  </div>

                  {/* Flags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.flags.map(f => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">{f}</span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Rating */}
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-muted-foreground">Rating</Label>
                      <Select value={item.localRating} onValueChange={v => setItems(prev => prev.map(i => i.id === item.id ? { ...i, localRating: v } : i))}>
                        <SelectTrigger className="h-6 w-20 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["G", "PG", "PG-13", "R"].map(r => <SelectItem key={r} value={r.toLowerCase().replace("-", "")}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Kids safe */}
                    <div className="flex items-center gap-1.5">
                      <Baby size={11} className="text-[var(--kids-primary)]" />
                      <Label className="text-[10px] text-muted-foreground">Kids Safe</Label>
                      <Switch
                        checked={item.localKids}
                        onCheckedChange={v => setItems(prev => prev.map(i => i.id === item.id ? { ...i, localKids: v } : i))}
                        className="scale-75"
                      />
                    </div>

                    {/* Preview */}
                    <button onClick={() => setPreview(item)} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                      <Eye size={11} />Preview
                    </button>
                  </div>

                  {/* Reason */}
                  <Textarea
                    placeholder="Reason (required for reject/flag)..."
                    value={item.reason}
                    onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, reason: e.target.value } : i))}
                    className="mt-2 resize-none h-12 text-xs"
                  />
                </div>
              </div>

              {/* Action bar */}
              <div className="border-t border-border px-4 py-2.5 flex gap-2 bg-muted/20">
                <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-500" onClick={() => setStatus(item.id, "approved")}>
                  <Check size={11} />Approve
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => setStatus(item.id, "rejected")}>
                  <X size={11} />Reject
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-orange-400 border-orange-500/30 hover:bg-orange-500/10" onClick={() => setStatus(item.id, "flagged")}>
                  <Flag size={11} />Flag
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">{preview?.title}</DialogTitle>
          </DialogHeader>
          <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted">
            {preview?.thumb
              ? <img src={preview.thumb} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-muted-foreground">No preview</div>
            }
          </div>
          <div className="text-xs text-muted-foreground">@{preview?.creator}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
