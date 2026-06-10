import { useState, useRef } from "react";
import { Upload, CloudUpload, Check, Image, Tag, Film, Lock, Baby, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

const STEPS = ["Upload", "Metadata", "Settings", "Publish"];

export function UploadFlow() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isKidsSafe, setIsKidsSafe] = useState(false);
  const [tags, setTags] = useState<string[]>(["#Cinematic", "#AI"]);
  const [tagInput, setTagInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [published, setPublished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) startUpload(f);
  }

  function startUpload(f: File) {
    setFile(f);
    setUploading(true);
    setUploadProgress(0);
    const timer = setInterval(() => {
      setUploadProgress(p => {
        if (p >= 100) { clearInterval(timer); setUploading(false); setUploaded(true); return 100; }
        return p + 8;
      });
    }, 150);
  }

  function addTag() {
    const t = tagInput.trim().startsWith("#") ? tagInput.trim() : `#${tagInput.trim()}`;
    if (t.length > 1 && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function handlePublish() {
    setProcessing(true);
    setTimeout(() => { setProcessing(false); setPublished(true); }, 2000);
  }

  if (published) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
            <Check size={28} className="text-green-400" />
          </div>
          <h2 className="font-semibold">Published!</h2>
          <p className="text-sm text-muted-foreground">Your video is live on the feed. It may take a few minutes to appear for all users.</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={() => { setPublished(false); setStep(0); setFile(null); setUploaded(false); }}>Upload Another</Button>
            <Button size="sm" variant="outline">View on Feed</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Upload size={16} className="text-primary" />
        <h1 className="font-semibold">Upload</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-0 flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                ${i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/20 border border-primary text-primary" : "bg-muted text-muted-foreground"}`}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 ${i === step ? "text-primary" : "text-muted-foreground"}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mt-[-10px] ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
              ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" className="hidden" accept="video/*,image/*" onChange={e => e.target.files?.[0] && startUpload(e.target.files[0])} />
            <CloudUpload size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">Drop video or image here</p>
            <p className="text-sm text-muted-foreground">MP4, MOV, WebM, JPG, PNG — max 500MB</p>
          </div>

          {file && (
            <div className="bg-card border border-border rounded-md p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Film size={16} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {uploaded && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ready</Badge>}
              </div>
              {uploading && (
                <div>
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
                </div>
              )}
            </div>
          )}

          <Button className="w-full" disabled={!uploaded} onClick={() => setStep(1)}>
            Continue <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      )}

      {/* Step 1: Metadata */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input defaultValue="Neon City AI Dreamscape" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea defaultValue="A fully AI-generated short film exploring cyberpunk aesthetics using Raivstream's latest models." className="resize-none h-24 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded">
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-destructive">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTag()}
                placeholder="#AddTag"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="outline" onClick={addTag} className="h-8">Add</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select defaultValue="ai-art">
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ai-art">AI Art</SelectItem>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="music-video">Music Video</SelectItem>
                <SelectItem value="tutorial">Tutorial</SelectItem>
                <SelectItem value="lifestyle">Lifestyle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Thumbnail</Label>
            <div className="border border-dashed border-border rounded-md p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors">
              <Image size={16} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to upload custom thumbnail</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(2)}>Continue <ChevronRight size={14} className="ml-1" /></Button>
          </div>
        </div>
      )}

      {/* Step 2: Settings */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-[var(--brand-pink)]" />
              <div>
                <p className="text-sm font-medium">Premium Only</p>
                <p className="text-xs text-muted-foreground">Subscribers-only access to this content</p>
              </div>
            </div>
            <Switch checked={isPremium} onCheckedChange={setIsPremium} />
          </div>
          <div className="flex items-center justify-between p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <Baby size={16} className="text-[var(--kids-primary)]" />
              <div>
                <p className="text-sm font-medium">Kids Safe</p>
                <p className="text-xs text-muted-foreground">Eligible for R16 Kids feed</p>
              </div>
            </div>
            <Switch checked={isKidsSafe} onCheckedChange={setIsKidsSafe} />
          </div>
          <div className="space-y-1.5">
            <Label>Content Rating</Label>
            <Select defaultValue="pg13">
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="g">G — General Audience</SelectItem>
                <SelectItem value="pg">PG — Parental Guidance</SelectItem>
                <SelectItem value="pg13">PG-13</SelectItem>
                <SelectItem value="r">R — Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>Review <ChevronRight size={14} className="ml-1" /></Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Publish */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-md divide-y divide-border">
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Title</span>
              <span className="text-sm font-medium">Neon City AI Dreamscape</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">File</span>
              <span className="text-sm">{file?.name || "video.mp4"}</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Premium</span>
              <Badge variant={isPremium ? "default" : "outline"}>{isPremium ? "Yes" : "No"}</Badge>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Kids Safe</span>
              <Badge variant={isKidsSafe ? "default" : "outline"}>{isKidsSafe ? "Yes" : "No"}</Badge>
            </div>
            <div className="p-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground mr-auto">Tags</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {tags.map(t => <span key={t} className="text-xs text-primary">{t}</span>)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
            <Button className="flex-1" onClick={handlePublish} disabled={processing}>
              {processing ? "Processing..." : "Publish Now"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
