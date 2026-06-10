import { useState } from "react";
import { Coins, Edit2, Check, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";

const FEATURE_RATES = [
  { id: "flux-pro", name: "Flux Pro 1.1", type: "Image", cost: 8 },
  { id: "flux-ultra", name: "Flux Ultra", type: "Image", cost: 20 },
  { id: "sdxl", name: "SDXL Turbo", type: "Image", cost: 3 },
  { id: "kling-v2", name: "Kling v2 Pro", type: "Video", cost: 40 },
  { id: "runway-gen4", name: "Runway Gen-4", type: "Video", cost: 55 },
  { id: "minimax", name: "MiniMax Video", type: "Video", cost: 25 },
];

type ResultState = null | { before: number; after: number; user: string };

export function AdminCredits() {
  const [tab, setTab] = useState("rates");
  const [rates, setRates] = useState(FEATURE_RATES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [action, setAction] = useState("gift");
  const [amount, setAmount] = useState("500");
  const [result, setResult] = useState<ResultState>(null);

  function startEdit(id: string, current: number) {
    setEditingId(id);
    setEditValue(String(current));
  }

  function saveEdit(id: string) {
    setRates(prev => prev.map(r => r.id === id ? { ...r, cost: parseInt(editValue) || r.cost } : r));
    setEditingId(null);
  }

  function applyCredit() {
    const amt = parseInt(amount);
    const delta = action === "deduct" ? -amt : amt;
    setResult({ before: 4857, after: 4857 + delta, user: "nova_creates" });
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-primary" />
        <h1 className="font-semibold">Admin — Credit Tools</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="rates" className="flex-1 text-xs">Feature Rates</TabsTrigger>
          <TabsTrigger value="manual" className="flex-1 text-xs">Manual Credits / Coupons</TabsTrigger>
        </TabsList>

        {/* Feature Rates */}
        <TabsContent value="rates" className="m-0 mt-4">
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Feature / Model", "Type", "Cost (credits)", "Action"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rates.map(r => (
                  <tr key={r.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === r.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="w-20 h-7 text-sm"
                            type="number"
                            min="1"
                          />
                          <button onClick={() => saveEdit(r.id)} className="text-green-400 hover:text-green-300"><Check size={13} /></button>
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
                        </div>
                      ) : (
                        <span className="font-mono text-xs">{r.cost}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => startEdit(r.id, r.cost)}
                      >
                        <Edit2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Changes take effect immediately for new generation jobs.</p>
        </TabsContent>

        {/* Manual Credits */}
        <TabsContent value="manual" className="m-0 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>User Email / Username / ID</Label>
                <Input placeholder="nova_creates or nova@example.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gift">Gift / Coupon</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="deduct">Deduct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Credit Amount</Label>
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea placeholder="e.g. Compensation for failed generation batch on Jun 9" className="resize-none h-16 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Coupon / Reference ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="PROMO-LAUNCH-2026" className="h-9 text-sm" />
              </div>
              <Button onClick={applyCredit} className="w-full">Apply Credits</Button>
            </div>

            {/* Sidebar / result */}
            <div className="space-y-3">
              {result && (
                <div className="bg-card border border-border rounded-md p-4 space-y-3">
                  <p className="text-sm font-medium">Result — @{result.user}</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Before</span>
                      <span className="font-mono">{result.before.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">After</span>
                      <span className={`font-mono font-medium ${result.after > result.before ? "text-green-400" : "text-destructive"}`}>
                        {result.after.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <span className="text-muted-foreground">Change</span>
                      <span className={`font-mono text-sm ${result.after > result.before ? "text-green-400" : "text-destructive"}`}>
                        {result.after > result.before ? "+" : ""}{(result.after - result.before).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/25 text-[10px]">Applied successfully</Badge>
                </div>
              )}

              <div className="bg-muted/30 border border-border rounded-md p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground text-sm">Ledger Behavior</p>
                <p><strong>Gift / Coupon:</strong> Adds credits immediately. Logged as a gift entry. Does not expire.</p>
                <p><strong>Refund:</strong> Returns credits for a failed or disputed transaction. Linked to original job ID when provided.</p>
                <p><strong>Deduct:</strong> Removes credits. Used for abuse correction. Requires reason. Will not reduce balance below 0.</p>
                <p className="text-[10px] pt-1 border-t border-border">All operations are audited with admin user ID and timestamp.</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
