import { NavLink, Outlet, useLocation } from "react-router";
import {
  Home, Search, Upload, Sparkles, BookOpen, Coins, CreditCard,
  BarChart2, Settings, Shield, User, LogIn, Baby, ChevronRight,
  Menu, X, Bell, Zap
} from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import logoSrc from "../../imports/raivstream-logo-1.jpg";

const NAV_MAIN = [
  { to: "/", icon: Home, label: "Home Feed" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/ai-studio", icon: Sparkles, label: "AI Studio" },
  { to: "/story-studio", icon: BookOpen, label: "Story Studio" },
];

const NAV_CREATOR = [
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/credits", icon: Coins, label: "Credits" },
  { to: "/pricing", icon: CreditCard, label: "Pricing" },
];

const NAV_ADMIN = [
  { to: "/admin", icon: Shield, label: "Admin Overview" },
  { to: "/admin/users", icon: User, label: "Users" },
  { to: "/admin/credits", icon: Coins, label: "Credit Tools" },
  { to: "/admin/moderation", icon: Shield, label: "Moderation" },
  { to: "/admin/jobs", icon: Zap, label: "Gen Jobs" },
];

const NAV_OTHER = [
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/r16", icon: Baby, label: "R16 Kids" },
  { to: "/signin", icon: LogIn, label: "Sign In" },
];

function NavItem({ to, icon: Icon, label, collapsed }: {
  to: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group relative
        ${isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        }
        ${collapsed ? "justify-center" : ""}`
      }
      title={collapsed ? label : undefined}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="h-px bg-border mx-2 my-1" />;
  return (
    <div className="px-3 pt-3 pb-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">{label}</span>
    </div>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const isFeed = location.pathname === "/";
  const isKids = location.pathname.startsWith("/r16");

  if (isFeed) {
    return (
      <div className="h-screen w-full bg-background overflow-hidden">
        <Outlet />
      </div>
    );
  }

  if (isKids) {
    return (
      <div className="h-screen w-full flex flex-col bg-[var(--kids-bg)] overflow-hidden">
        <header className="h-12 flex items-center px-4 border-b border-[var(--kids-primary)]/20 shrink-0">
          <span className="font-semibold text-[var(--kids-primary)] tracking-wide">R16 Kids</span>
          <span className="ml-2 text-xs bg-[var(--kids-primary)]/20 text-[var(--kids-primary)] px-2 py-0.5 rounded">Safe Mode</span>
        </header>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${collapsed ? "w-[52px]" : "w-[220px]"}
          shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border
          transition-all duration-200
          fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className={`h-14 flex items-center shrink-0 border-b border-sidebar-border ${collapsed ? "justify-center px-2" : "px-4"}`}>
          {collapsed ? (
            <div className="w-7 h-7 rounded-md overflow-hidden">
              <img src={logoSrc} alt="Raivstream" className="w-full h-full object-cover object-center scale-150" />
            </div>
          ) : (
            <img src={logoSrc} alt="Raivstream" className="h-6 object-contain object-left" style={{ maxWidth: 140 }} />
          )}
        </div>

        {/* Nav scroll area */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1.5">
          <SectionLabel label="Discover" collapsed={collapsed} />
          {NAV_MAIN.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          <SectionLabel label="Creator" collapsed={collapsed} />
          {NAV_CREATOR.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          <SectionLabel label="Admin" collapsed={collapsed} />
          {NAV_ADMIN.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          <SectionLabel label="Account" collapsed={collapsed} />
          {NAV_OTHER.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex h-10 items-center justify-center border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight size={14} className={`transition-transform ${collapsed ? "" : "rotate-180"}`} />
        </button>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-background/80 backdrop-blur-sm">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <button className="relative text-muted-foreground hover:text-foreground transition-colors">
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--brand-pink)] via-[var(--brand-purple)] to-[var(--brand-cyan)] flex items-center justify-center text-white text-xs font-semibold">
            CR
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex">
        {[
          { to: "/", icon: Home, label: "Feed" },
          { to: "/search", icon: Search, label: "Search" },
          { to: "/upload", icon: Upload, label: "Upload" },
          { to: "/ai-studio", icon: Sparkles, label: "AI" },
          { to: "/profile", icon: User, label: "Profile" },
        ].map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors
              ${isActive ? "text-primary" : "text-muted-foreground"}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
