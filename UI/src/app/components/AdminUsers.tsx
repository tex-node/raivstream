import { useState } from "react";
import { Search, UserX, UserCheck, Coins, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";

const USERS = [
  { id: 1, username: "nova_creates", email: "nova@example.com", role: "creator", tier: "creator", credits: 4857, status: "active", joined: "Jan 2026" },
  { id: 2, username: "vox_films", email: "vox@example.com", role: "creator", tier: "creator", credits: 12044, status: "active", joined: "Feb 2026" },
  { id: 3, username: "synthwave_kai", email: "kai@example.com", role: "viewer", tier: "viewer", credits: 234, status: "active", joined: "Mar 2026" },
  { id: 4, username: "luna.ai", email: "luna@example.com", role: "creator", tier: "free", credits: 50, status: "active", joined: "Apr 2026" },
  { id: 5, username: "reel_creators", email: "reel@example.com", role: "viewer", tier: "viewer", credits: 810, status: "active", joined: "Apr 2026" },
  { id: 6, username: "bad_actor_99", email: "bad@example.com", role: "viewer", tier: "free", credits: 0, status: "banned", joined: "May 2026" },
  { id: 7, username: "admin_test", email: "admin@raivstream.com", role: "admin", tier: "creator", credits: 99999, status: "active", joined: "Jan 2026" },
];

const tierColor: Record<string, string> = {
  free: "text-muted-foreground border-muted-foreground/30",
  viewer: "text-blue-400 border-blue-500/30",
  creator: "text-primary border-primary/30",
};

const roleColor: Record<string, string> = {
  viewer: "text-muted-foreground",
  creator: "text-[var(--brand-cyan)]",
  admin: "text-[var(--brand-pink)]",
};

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState(USERS);
  const [creditModal, setCreditModal] = useState<typeof USERS[0] | null>(null);
  const [creditAmt, setCreditAmt] = useState("100");

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function toggleBan(id: number) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === "banned" ? "active" : "banned" } : u));
  }

  function adjustCredits() {
    if (!creditModal) return;
    setUsers(prev => prev.map(u => u.id === creditModal.id ? { ...u, credits: u.credits + parseInt(creditAmt) } : u));
    setCreditModal(null);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold">Admin — Users</h1>
        <Badge variant="outline" className="text-[10px]">{users.length} total</Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username or email..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["User", "Role", "Tier", "Credits", "Status", "Joined", "Actions"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(user => (
                <tr key={user.id} className={`hover:bg-white/3 transition-colors ${user.status === "banned" ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-xs">@{user.username}</p>
                      <p className="text-[10px] text-muted-foreground">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${roleColor[user.role]}`}>{user.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${tierColor[user.tier]}`}>{user.tier}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{user.credits.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-[10px] ${user.status === "active" ? "text-green-400 border-green-500/30" : "text-destructive border-destructive/30"}`}>
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.joined}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setCreditModal(user)}
                        title="Adjust credits"
                      >
                        <Coins size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-6 w-6 p-0 ${user.status === "banned" ? "text-green-400" : "text-destructive"}`}
                        onClick={() => toggleBan(user.id)}
                        title={user.status === "banned" ? "Unban" : "Ban"}
                      >
                        {user.status === "banned" ? <UserCheck size={12} /> : <UserX size={12} />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit adjust modal */}
      <Dialog open={!!creditModal} onOpenChange={() => setCreditModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Adjust Credits — @{creditModal?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">Current balance: <span className="text-foreground font-medium">{creditModal?.credits.toLocaleString()}</span></div>
            <div className="space-y-1">
              <Label>Amount (use negative to deduct)</Label>
              <Input value={creditAmt} onChange={e => setCreditAmt(e.target.value)} type="number" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input defaultValue="Manual adjustment" className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreditModal(null)}>Cancel</Button>
            <Button size="sm" onClick={adjustCredits}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
