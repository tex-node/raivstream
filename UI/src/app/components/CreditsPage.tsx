import { useState } from "react";
import { Coins, TrendingUp, TrendingDown, RefreshCw, ShoppingBag, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

const PACKAGES = [
  { id: "1k", credits: 1000, priceNGN: 2500, priceUSD: 1.60, popular: false },
  { id: "5k", credits: 5000, priceNGN: 10000, priceUSD: 6.50, popular: true },
  { id: "10k", credits: 10000, priceNGN: 18000, priceUSD: 11.50, popular: false },
];

const HISTORY = [
  { id: 1, type: "purchase", desc: "Purchased 5,000 credits", amount: +5000, date: "Jun 9, 2026", ref: "PS-REF-20982" },
  { id: 2, type: "usage", desc: "Flux Pro 1.1 generation", amount: -8, date: "Jun 9, 2026", ref: "GEN-44892" },
  { id: 3, type: "usage", desc: "Runway Gen-4 generation", amount: -55, date: "Jun 8, 2026", ref: "GEN-44201" },
  { id: 4, type: "usage", desc: "Flux Ultra generation ×3", amount: -60, date: "Jun 8, 2026", ref: "GEN-44010" },
  { id: 5, type: "refund", desc: "Failed generation refund", amount: +55, date: "Jun 7, 2026", ref: "REF-10441" },
  { id: 6, type: "purchase", desc: "Purchased 1,000 credits", amount: +1000, date: "Jun 5, 2026", ref: "PS-REF-19201" },
  { id: 7, type: "usage", desc: "SDXL Turbo generation ×5", amount: -15, date: "Jun 4, 2026", ref: "GEN-43200" },
];

export function CreditsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const balance = 4857;

  function handleCheckout() {
    alert(`Redirecting to Paystack for ${PACKAGES.find(p => p.id === selected)?.credits.toLocaleString()} credits...`);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-primary" />
        <h1 className="font-semibold">Credits</h1>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-r from-[var(--brand-purple)]/20 to-[var(--brand-cyan)]/20 border border-[var(--brand-cyan)]/20 rounded-md p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
          <div className="flex items-center gap-2">
            <Coins size={20} className="text-primary" />
            <span className="text-2xl font-semibold">{balance.toLocaleString()}</span>
            <span className="text-muted-foreground text-sm">credits</span>
          </div>
        </div>
        <Badge className="text-xs bg-[var(--brand-cyan)]/20 text-[var(--brand-cyan)] border-[var(--brand-cyan)]/30">Active</Badge>
      </div>

      {/* Packages */}
      <div>
        <h2 className="text-sm font-medium mb-3">Buy Credits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PACKAGES.map(pkg => (
            <div
              key={pkg.id}
              onClick={() => setSelected(pkg.id)}
              className={`relative bg-card border rounded-md p-4 cursor-pointer transition-all
                ${selected === pkg.id ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-primary/40"}
                ${pkg.popular ? "ring-1 ring-[var(--brand-pink)]/40" : ""}`}
            >
              {pkg.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand-pink)] text-white font-medium">
                  Most Popular
                </span>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Coins size={18} className="text-primary" />
                <span className="font-semibold">{pkg.credits.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">credits</span>
              </div>
              <p className="font-semibold">₦{pkg.priceNGN.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">≈ ${pkg.priceUSD}</p>
            </div>
          ))}
        </div>
        <Button
          className="mt-3 gap-1.5"
          disabled={!selected}
          onClick={handleCheckout}
        >
          <ShoppingBag size={14} />
          Buy with Paystack
          {selected && <span className="ml-1 opacity-70">— ₦{PACKAGES.find(p => p.id === selected)?.priceNGN.toLocaleString()}</span>}
        </Button>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-medium mb-3">Transaction History</h2>
        <div className="bg-card border border-border rounded-md divide-y divide-border overflow-hidden">
          {HISTORY.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                ${tx.type === "purchase" ? "bg-green-500/15 text-green-400" :
                  tx.type === "refund" ? "bg-blue-500/15 text-blue-400" :
                  "bg-muted text-muted-foreground"}`}>
                {tx.type === "purchase" ? <ArrowDownRight size={13} /> :
                 tx.type === "refund" ? <RefreshCw size={13} /> :
                 <ArrowUpRight size={13} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{tx.desc}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{tx.ref} · {tx.date}</p>
              </div>
              <span className={`text-sm font-medium shrink-0
                ${tx.amount > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
