'use client';

type PreviewScene = { sceneId: string; title: string; beat: string; narration?: string; visualDirection?: string; estimatedDurationSeconds: number; shotCount: number };
type Preview = {
  structure: string;
  runtimeSeconds: number;
  scenes: PreviewScene[];
  characters: Array<Record<string, unknown>>;
  worlds: Array<Record<string, unknown>>;
  notes?: string[];
};

/** Raivstream 5.0 — preview before production: "is this what I meant?" */
export function PreviewPanel({
  preview,
  onApprove,
  approving,
}: {
  preview: Preview;
  onApprove: () => void;
  approving?: boolean;
}) {
  return (
    <section id="preview" className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Preview — before production</p>
      <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-[var(--noc-t3)]">
        <span>{preview.structure}</span>
        <span>·</span>
        <span>~{preview.runtimeSeconds}s</span>
        <span>·</span>
        <span>{preview.scenes.length} scenes</span>
      </div>

      <div className="mt-4 space-y-3">
        {preview.scenes.map((scene) => (
          <div key={scene.sceneId} className="rounded-xl bg-[rgba(233,233,237,0.05)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black">{scene.title}</p>
              <span className="text-xs font-bold text-[var(--noc-t4)]">{scene.estimatedDurationSeconds}s · {scene.shotCount} shots</span>
            </div>
            <p className="mt-1 text-xs text-[var(--noc-t5)]">{scene.beat}</p>
            {scene.narration && <p className="mt-1 text-xs italic text-[var(--noc-t3)]">“{scene.narration}”</p>}
          </div>
        ))}
      </div>

      {preview.characters.length > 0 && (
        <p className="mt-3 text-xs text-[var(--noc-t5)]">Characters: {preview.characters.map((c: any) => c.name ?? 'character').join(', ')}</p>
      )}
      {preview.worlds.length > 0 && <p className="mt-1 text-xs text-[var(--noc-t5)]">Worlds: {preview.worlds.map((w: any) => w.name ?? 'world').join(', ')}</p>}

      <button
        type="button"
        disabled={approving}
        onClick={onApprove}
        className="mt-4 w-full rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-5 py-3 font-black text-[#0B0D12] disabled:opacity-50"
      >
        {approving ? 'Approving…' : 'Yes, this is what I meant — approve preview'}
      </button>
    </section>
  );
}