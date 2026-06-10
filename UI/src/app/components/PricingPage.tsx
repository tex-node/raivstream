import { Check, Coins, CreditCard, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₦0",
    period: "/mo",
    desc: "Browse and enjoy public content.",
    cta: "Current Plan",
    ctaVariant: "outline" as const,
    highlight: false,
    features: [
      "Public feed access",
      "Follow creators",
      "Like & rate videos",
      "Limited AI credits (50/mo)",
      "Standard SD quality",
    ],
    missing: ["Premium content", "Creator tools", "Analytics", "HD/4K quality"],
  },
  {
    id: "viewer",
    name: "Viewer",
    price: "₦2,500",
    period: "/mo",
    desc: "Full access to all premium content.",
    cta: "Upgrade to Viewer",
    ctaVariant: "default" as const,
    highlight: false,
    badge: null,
    features: [
      "Everything in Free",
      "Unlock all premium content",
      "HD quality playback",
      "No ads",
      "250 AI credits/month",
      "Priority support",
    ],
    missing: ["Creator tools", "Analytics", "Publish videos"],
  },
  {
    id: "creator",
    name: "Creator",
    price: "₦6,500",
    period: "/mo",
    desc: "Create, publish, earn, and grow.",
    cta: "Become a Creator",
    ctaVariant: "default" as const,
    highlight: true,
    badge: "Best Value",
    features: [
      "Everything in Viewer",
      "Upload & publish videos",
      "AI Studio access",
      "Story Studio access",
      "Analytics dashboard",
      "Revenue sharing",
      "1,000 AI credits/month",
      "4K quality",
      "Priority moderation",
    ],
    missing: [],
  },
];

const CREDIT_UPSELLS = [
  { credits: 1000, price: "₦2,500", desc: "For casual generators" },
  { credits: 5000, price: "₦10,000", desc: "Most popular — save 20%" },
  { credits: 10000, price: "₦18,000", desc: "Power users — save 28%" },
];

export function PricingPage() {
  return (
    <div className="p-6 max-w-5xl space-y-10">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <CreditCard size={16} className="text-primary" />
          <h1 className="font-semibold">Pricing</h1>
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Choose the plan that fits how you use Raivstream — as a viewer, a creator, or both.
        </p>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`relative bg-card border rounded-md p-5 flex flex-col
              ${plan.highlight ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border"}`}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2.5 py-0.5 rounded-full font-medium"
                style={{ background: "linear-gradient(90deg, var(--brand-pink), var(--brand-cyan))", color: "white" }}>
                {plan.badge}
              </span>
            )}
            <div className="mb-4">
              <p className="font-semibold mb-0.5">{plan.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-xs text-muted-foreground">{plan.desc}</p>
            </div>

            <Button variant={plan.ctaVariant} size="sm" className="mb-4 w-full">
              {plan.cta}
            </Button>

            <div className="flex-1 space-y-2">
              {plan.features.map(f => (
                <div key={f} className="flex items-start gap-2 text-xs">
                  <Check size={12} className="text-green-400 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
              {plan.missing?.map(f => (
                <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground/50">
                  <span className="w-3 text-center mt-0.5 shrink-0">—</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Credit upsells */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Coins size={15} className="text-primary" />
          <h2 className="font-medium text-sm">Credit Packs</h2>
          <span className="text-xs text-muted-foreground">— Use for AI generation regardless of plan</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDIT_UPSELLS.map(pkg => (
            <div key={pkg.credits} className="bg-card border border-border rounded-md p-4 flex items-center justify-between hover:border-primary/40 transition-colors cursor-pointer">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Coins size={13} className="text-primary" />
                  <span className="font-semibold">{pkg.credits.toLocaleString()} credits</span>
                </div>
                <p className="text-xs text-muted-foreground">{pkg.desc}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-sm">{pkg.price}</p>
                <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1">Buy</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
