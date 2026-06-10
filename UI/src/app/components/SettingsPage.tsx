import { Settings, Bell, Shield, Palette, User, LogOut, Moon, Sun } from "lucide-react";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h2>
      <div className="bg-card border border-border rounded-md divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, desc, control }: { label: string; desc?: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-4">
      <div>
        <p className="text-sm">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div className="flex items-center gap-2">
        <Settings size={16} className="text-primary" />
        <h1 className="font-semibold">Settings</h1>
      </div>

      <Section title="Account">
        <SettingRow
          label="Display Name"
          control={<Input defaultValue="Nova Creates" className="h-8 w-40 text-sm" />}
        />
        <SettingRow
          label="Username"
          control={<Input defaultValue="@nova_creates" className="h-8 w-40 text-sm" />}
        />
        <SettingRow
          label="Email"
          control={<Input defaultValue="nova@example.com" type="email" className="h-8 w-48 text-sm" />}
        />
        <SettingRow
          label="Password"
          control={<Button variant="outline" size="sm" className="h-8 text-xs">Change</Button>}
        />
      </Section>

      <Section title="Notifications">
        <SettingRow label="New followers" control={<Switch defaultChecked />} />
        <SettingRow label="Comments & replies" control={<Switch defaultChecked />} />
        <SettingRow label="Generation completed" desc="Notify when AI jobs finish" control={<Switch defaultChecked />} />
        <SettingRow label="New video from following" control={<Switch />} />
        <SettingRow label="Promotional emails" control={<Switch />} />
      </Section>

      <Section title="Privacy">
        <SettingRow label="Private profile" desc="Only followers can see your content" control={<Switch />} />
        <SettingRow label="Show on discovery" control={<Switch defaultChecked />} />
        <SettingRow
          label="Content rating"
          control={
            <Select defaultValue="pg13">
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="g">G</SelectItem>
                <SelectItem value="pg">PG</SelectItem>
                <SelectItem value="pg13">PG-13</SelectItem>
                <SelectItem value="r">R</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </Section>

      <Section title="Appearance">
        <SettingRow
          label="Theme"
          control={
            <Select defaultValue="dark">
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingRow label="Reduce motion" control={<Switch />} />
      </Section>

      <div className="flex gap-2">
        <Button>Save Changes</Button>
        <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
          <LogOut size={14} />Sign Out
        </Button>
      </div>
    </div>
  );
}
