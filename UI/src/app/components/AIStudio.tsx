import { useState } from "react";
import { Sparkles, ChevronDown, Image, Film, Zap, CheckCircle2, XCircle, Clock, AlertTriangle, Send, BookOpen, Coins } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import { Separator } from "./ui/separator";

const MODELS = [
  { id: "flux-pro", name: "Flux Pro 1.1", type: "image", status: "online", cost: 8, badge: "Popular" },
  { id: "flux-ultra", name: "Flux Ultra", type: "image", status: "online", cost: 20, badge: "Best" },
  { id: "sd-xl", name: "SDXL Turbo", type: "image", status: "online", cost: 3, badge: null },
  { id: "kling-v2", name: "Kling v2 Pro", type: "video", status: "online", cost: 40, badge: "New" },
  { id: "runway-gen4", name: "Runway Gen-4", type: "video", status: "online", cost: 55, badge: "Best" },
  { id: "minimax-video", name: "MiniMax Video", type: "video", status: "degraded", cost: 25, badge: null },
];

const RATIOS = ["1:1", "9:16", "16:9", "4:3", "3:2", "2:3"];
const DURATIONS = ["5s", "8s", "10s", "15s"];

type JobStatus = "idle" | "queued" | "generating" | "completed" | "failed" | "rejected";

export function AIStudio() {
  const [mode, setMode] = useState<"image" | "video">("image");
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("8s");
  const [seedUrl, setSeedUrl] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [creditBalance] = useState(1240);

  const filteredModels = MODELS.filter(m => m.type === mode);
  const creditCost = selectedModel.cost;
  const hasCredits = creditBalance >= creditCost;
  const promptLen = prompt.length;

  function handleGenerate() {
    if (!hasCredits) return;
    setJobStatus("queued");
    setProgress(0);
    setTimeout(() => { setJobStatus("generating"); setProgress(30); }, 800);
    setTimeout(() => setProgress(65), 2000);
    setTimeout(() => setProgress(90), 3500);
    setTimeout(() => { setJobStatus("completed"); setProgress(100); }, 4500);
  }

  const OUTPUT_IMAGE = "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=500&h=800&fit=crop&auto=format";

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Config panel */}
      <div className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-primary" />
            <h1 className="font-semibold">AI Studio</h1>
          </div>
          {/* Mode switch */}
          <Tabs value={mode} onValueChange={v => { setMode(v as "image" | "video"); setSelectedModel(MODELS.find(m => m.type === v) || MODELS[0]); }}>
            <TabsList className="w-full">
              <TabsTrigger value="image" className="flex-1 gap-1.5"><Image size={13} />Image</TabsTrigger>
              <TabsTrigger value="video" className="flex-1 gap-1.5"><Film size={13} />Video</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 p-4 space-y-5">
          {/* Model selector */}
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select
              value={selectedModel.id}
              onValueChange={id => setSelectedModel(filteredModels.find(m => m.id === id) || filteredModels[0])}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredModels.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2 py-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === "online" ? "bg-green-400" : "bg-yellow-400"}`} />
                      <span>{m.name}</span>
                      {m.badge && (
                        <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">{m.badge}</Badge>
                      )}
                      <span className="ml-auto text-muted-foreground text-xs flex items-center gap-0.5">
                        <Coins size={10} />{m.cost}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Prompt</Label>
              <span className="text-[10px] text-muted-foreground">{promptLen}/1500</span>
            </div>
            <Textarea
              placeholder="Describe the scene, style, lighting, mood..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              maxLength={1500}
              className="resize-none h-24 text-sm"
            />
          </div>

          {/* Negative prompt */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Negative Prompt</Label>
            <Textarea
              placeholder="What to avoid: blur, watermark, deformed..."
              value={negPrompt}
              onChange={e => setNegPrompt(e.target.value)}
              className="resize-none h-16 text-sm"
            />
          </div>

          {/* Aspect ratio */}
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map(r => (
                <button
                  key={r}
                  onClick={() => setRatio(r)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors
                    ${ratio === r ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Duration (video only) */}
          {mode === "video" && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex gap-1.5">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors
                      ${duration === d ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-foreground/30"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Seed image (video) */}
          {mode === "video" && (
            <div className="space-y-1.5">
              <Label>Seed Image URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="https://... or paste image URL"
                value={seedUrl}
                onChange={e => setSeedUrl(e.target.value)}
                className="text-sm h-9"
              />
            </div>
          )}
        </div>

        {/* Generate footer */}
        <div className="p-4 border-t border-border space-y-3">
          {/* Credit balance */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Balance</span>
            <span className={`font-medium flex items-center gap-1 ${hasCredits ? "text-foreground" : "text-destructive"}`}>
              <Coins size={13} /> {creditBalance.toLocaleString()} credits
            </span>
          </div>

          {!hasCredits && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <AlertTriangle size={13} />
              Insufficient credits. Need {creditCost}, have {creditBalance}.
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!prompt.trim() || !hasCredits || (jobStatus === "generating" || jobStatus === "queued")}
          >
            <Sparkles size={14} className="mr-1.5" />
            Generate
            <span className="ml-auto flex items-center gap-0.5 opacity-70">
              <Coins size={11} /> {creditCost}
            </span>
          </Button>
        </div>
      </div>

      {/* Output panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-medium text-sm">Output</h2>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          {jobStatus === "idle" && (
            <div className="text-center">
              <Sparkles size={40} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Configure your settings and generate</p>
            </div>
          )}

          {(jobStatus === "queued" || jobStatus === "generating") && (
            <div className="w-full max-w-sm text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <div>
                <p className="font-medium mb-1">
                  {jobStatus === "queued" ? "Queued..." : "Generating..."}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {jobStatus === "queued" ? "Waiting for available worker" : `Processing with ${selectedModel.name}`}
                </p>
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">{progress}%</p>
              </div>
            </div>
          )}

          {jobStatus === "failed" && (
            <div className="text-center space-y-3">
              <XCircle size={40} className="mx-auto text-destructive" />
              <p className="font-medium">Generation Failed</p>
              <p className="text-sm text-muted-foreground">Credits were not charged. Try again.</p>
              <Button variant="outline" size="sm" onClick={() => setJobStatus("idle")}>Retry</Button>
            </div>
          )}

          {jobStatus === "rejected" && (
            <div className="text-center space-y-3">
              <AlertTriangle size={40} className="mx-auto text-yellow-500" />
              <p className="font-medium">Content Rejected</p>
              <p className="text-sm text-muted-foreground max-w-xs">Your prompt was flagged by moderation. Please revise and try again.</p>
              <Button variant="outline" size="sm" onClick={() => setJobStatus("idle")}>Edit Prompt</Button>
            </div>
          )}

          {jobStatus === "completed" && (
            <div className="w-full max-w-sm space-y-4">
              <div className="relative rounded-lg overflow-hidden aspect-[9/16] bg-muted">
                <img src={OUTPUT_IMAGE} alt="Generated output" className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2">
                  <Badge className="bg-green-500/90 text-white border-0 text-[10px]">
                    <CheckCircle2 size={10} className="mr-1" /> Completed
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-1.5" size="sm">
                  <Send size={13} />Publish to Feed
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" size="sm">
                  <BookOpen size={13} />Storyboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
