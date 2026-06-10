import { useState } from "react";
import { BookOpen, Plus, Sparkles, User, Mountain, Film, Image, ChevronRight, MoreHorizontal, Clapperboard, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

const PROJECTS = [
  { id: 1, title: "Neon Requiem", scenes: 12, shots: 34, status: "In Progress", lastEdit: "2h ago" },
  { id: 2, title: "Echoes of Tomorrow", scenes: 5, shots: 14, status: "Draft", lastEdit: "Yesterday" },
  { id: 3, title: "The Last Signal", scenes: 20, shots: 60, status: "Complete", lastEdit: "3 days ago" },
];

const SHOTS = [
  {
    id: 1, scene: "SC-01", shot: "SH-001", type: "Wide",
    camera: "Drone establishing", action: "City at dawn, neon signs fading",
    imagePrompt: "Aerial view of a dystopian city at golden hour, neon lights, cyberpunk aesthetic",
    videoPrompt: "Slow drone pull-back reveal of the city",
    character: "—", env: "Neon City",
    thumb: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=120&h=80&fit=crop&auto=format",
  },
  {
    id: 2, scene: "SC-01", shot: "SH-002", type: "Close-up",
    camera: "Handheld low", action: "KIRA walks through empty market stalls",
    imagePrompt: "Close-up of a young woman in a sleek dark coat, rain-soaked street behind her",
    videoPrompt: "Tracking shot following KIRA, slow motion rain",
    character: "KIRA", env: "Market District",
    thumb: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=80&fit=crop&auto=format",
  },
  {
    id: 3, scene: "SC-02", shot: "SH-003", type: "Medium",
    camera: "Eye-level static", action: "KIRA discovers the transmission device",
    imagePrompt: "A glowing electronic device on a worn table, dramatic backlighting",
    videoPrompt: "Slow zoom in to the glowing device as KIRA reaches for it",
    character: "KIRA", env: "Safe House",
    thumb: null,
  },
];

const CHARACTERS = [
  { id: 1, name: "KIRA", role: "Protagonist", desc: "Ex-comms officer, 28, determined. Dark hair, augmented eye.", color: "from-[var(--brand-pink)] to-[var(--brand-purple)]" },
  { id: 2, name: "ECHO", role: "AI Entity", desc: "Disembodied AI, voice only. Calm, logical, hiding something.", color: "from-[var(--brand-cyan)] to-[var(--brand-purple)]" },
];

const ENVIRONMENTS = [
  { id: 1, name: "Neon City", desc: "Rain-soaked, cyberpunk megacity. Night, neon reflections.", color: "from-[var(--brand-purple)] to-[var(--brand-cyan)]" },
  { id: 2, name: "Safe House", desc: "Abandoned apartment, sparse, one flickering light.", color: "from-[var(--brand-pink)] to-[var(--brand-cyan)]" },
  { id: 3, name: "Market District", desc: "Empty dawn market, stalls closed, fog rolling in.", color: "from-gray-700 to-gray-600" },
];

export function StoryStudio() {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]);
  const [detailTab, setDetailTab] = useState("shots");
  const [expandedShot, setExpandedShot] = useState<number | null>(1);

  if (view === "list") {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-primary" />
            <h1 className="font-semibold">Story Studio</h1>
          </div>
          <Button size="sm" className="gap-1.5">
            <Plus size={14} />New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROJECTS.map(p => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-md p-4 cursor-pointer hover:border-primary/40 transition-colors group"
              onClick={() => { setSelectedProject(p); setView("detail"); }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded bg-gradient-to-br from-[var(--brand-pink)] via-[var(--brand-purple)] to-[var(--brand-cyan)] flex items-center justify-center">
                  <Clapperboard size={16} className="text-white" />
                </div>
                <Badge variant={p.status === "Complete" ? "default" : p.status === "In Progress" ? "secondary" : "outline"} className="text-[10px]">
                  {p.status}
                </Badge>
              </div>
              <h3 className="font-medium mb-1 group-hover:text-primary transition-colors">{p.title}</h3>
              <p className="text-xs text-muted-foreground">{p.scenes} scenes · {p.shots} shots</p>
              <p className="text-xs text-muted-foreground mt-1">Edited {p.lastEdit}</p>
            </div>
          ))}

          {/* Empty state / new */}
          <div className="bg-card border border-dashed border-border rounded-md p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/40 transition-colors min-h-[130px]">
            <Plus size={20} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">New Story</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground text-sm">
          ← Projects
        </button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="font-medium text-sm">{selectedProject.title}</span>
        <Badge variant="outline" className="text-[10px]">{selectedProject.status}</Badge>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
            <Sparkles size={12} />Generate All
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 border-b border-border">
              <TabsList className="h-9 bg-transparent p-0 gap-0">
                {["shots", "script", "characters", "environments"].map(t => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize text-xs px-3"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="shots" className="flex-1 overflow-y-auto p-4 space-y-2 m-0">
              {SHOTS.map(shot => (
                <div key={shot.id} className="bg-card border border-border rounded-md overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/3 transition-colors"
                    onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                  >
                    {/* Thumb */}
                    <div className="w-16 h-10 rounded bg-muted overflow-hidden shrink-0">
                      {shot.thumb
                        ? <img src={shot.thumb} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-muted-foreground/30"><Image size={14} /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{shot.scene}</span>
                        <span className="text-xs text-muted-foreground font-mono">{shot.shot}</span>
                        <Badge variant="outline" className="text-[10px] h-4">{shot.type}</Badge>
                        {shot.character !== "—" && <Badge variant="secondary" className="text-[10px] h-4">{shot.character}</Badge>}
                      </div>
                      <p className="text-xs mt-0.5 truncate">{shot.action}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 px-2">
                        <Sparkles size={10} />AI
                      </Button>
                      <ChevronRight size={14} className={`text-muted-foreground transition-transform ${expandedShot === shot.id ? "rotate-90" : ""}`} />
                    </div>
                  </div>

                  {expandedShot === shot.id && (
                    <div className="border-t border-border p-3 grid grid-cols-2 gap-3 bg-muted/30">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Image Prompt</Label>
                        <Textarea defaultValue={shot.imagePrompt} className="text-xs h-20 resize-none" />
                        <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1">
                          <Image size={10} />Send to AI Studio
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Video Prompt</Label>
                        <Textarea defaultValue={shot.videoPrompt} className="text-xs h-20 resize-none" />
                        <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1">
                          <Film size={10} />Send to AI Studio
                        </Button>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Camera</Label>
                        <p className="text-xs mt-0.5">{shot.camera}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Environment</Label>
                        <p className="text-xs mt-0.5">{shot.env}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 w-full">
                <Plus size={13} />Add Shot
              </Button>
            </TabsContent>

            <TabsContent value="script" className="flex-1 overflow-y-auto p-4 m-0">
              <Textarea
                className="w-full min-h-[400px] text-sm font-mono resize-none"
                defaultValue={`NEON REQUIEM\nAn original short-form cinematic story.\n\nACT ONE: THE SIGNAL\n\nEXT. NEON CITY — DAWN\n\nA rain-soaked city stirs. Holographic advertisements flicker over empty streets. The world is quiet in a way that suggests something terrible has already happened.\n\nKIRA (V.O.)\nThey told us the network was for everyone. That was the first lie.\n\nKIRA moves through the fog of the market district, coat pulled tight against the cold. She is precise, watchful.\n\nINT. SAFE HOUSE — CONTINUOUS\n\nA sparse room. One working lamp. KIRA enters and locks three bolts behind her. On the table: a device, no larger than a palm, pulsing with cold blue light.\n\nECHO (V.O.)\nYou found it.\n\nKIRA\nI found it. Now what?`}
              />
            </TabsContent>

            <TabsContent value="characters" className="flex-1 overflow-y-auto p-4 m-0">
              <div className="space-y-3 max-w-2xl">
                {CHARACTERS.map(c => (
                  <div key={c.id} className="bg-card border border-border rounded-md p-4 flex gap-4">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${c.color} flex items-center justify-center text-white font-bold shrink-0`}>
                      {c.name[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline" className="text-[10px]">{c.role}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.desc}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0">
                      <MoreHorizontal size={14} />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Plus size={13} />Add Character
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="environments" className="flex-1 overflow-y-auto p-4 m-0">
              <div className="space-y-3 max-w-2xl">
                {ENVIRONMENTS.map(e => (
                  <div key={e.id} className="bg-card border border-border rounded-md p-4 flex gap-4">
                    <div className={`w-12 h-12 rounded bg-gradient-to-br ${e.color} flex items-center justify-center shrink-0`}>
                      <Mountain size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">{e.name}</p>
                      <p className="text-sm text-muted-foreground">{e.desc}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0">
                      <MoreHorizontal size={14} />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Plus size={13} />Add Environment
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
