'use client';

type PlanShot = { shotId: string; title: string; camera?: string; durationSeconds: number; visualDirection?: string };
type PlanScene = { sceneId: string; title: string; beat: string; description: string; narration?: string; estimatedDurationSeconds: number; shots: PlanShot[] };

/**
 * Raivstream 5.0 — the creative plan, presented for creators.
 *
 * The plan drives production internally, so it is NOT a configuration surface.
 * Creators see the scenes and their intent; the automatic shot breakdown,
 * camera notes and production notes live behind "Details" (progressive
 * disclosure). The production architecture is unchanged.
 */
export function PlanView({ plan }: { plan: { structure?: string; totalRuntimeSeconds: number; scenes: PlanScene[]; notes?: string[] } }) {
  return (
    <section id="plan" className="space-y-4">
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Your creative plan</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--noc-t3)]">
          <span>{plan.structure ?? 'A clear cinematic structure'}</span>
          <span className="text-[var(--noc-t6)]">·</span>
          <span>~{plan.totalRuntimeSeconds}s</span>
          <span className="text-[var(--noc-t6)]">·</span>
          <span>{plan.scenes.length} scenes</span>
        </div>
        <p className="mt-1 text-xs text-[var(--noc-t5)]">Shots, camera and timing are decided automatically. You direct the outcome.</p>
      </div>

      {plan.scenes.map((scene, index) => (
        <article key={scene.sceneId} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">
              Scene {String(index + 1).padStart(2, '0')} · {scene.beat}
            </p>
            <span className="rounded-full bg-[rgba(79,139,214,0.12)] px-2 py-0.5 text-xs font-bold text-[var(--noc-blue)]">~{scene.estimatedDurationSeconds}s</span>
          </div>
          <h3 className="mt-1 text-lg font-black">{scene.title}</h3>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">{scene.description}</p>
          {scene.narration && <p className="mt-2 border-l-2 border-[var(--noc-purple)] pl-2 text-sm italic text-[var(--noc-t3)]">“{scene.narration}”</p>}

          <details className="mt-3 rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-3">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Shot details · automatic</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {scene.shots.map((shot, shotIndex) => (
                <div key={shot.shotId} className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase text-[var(--noc-t6)]">Shot {shotIndex + 1}</p>
                    <span className="text-xs font-bold text-[var(--noc-t5)]">{shot.durationSeconds}s</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--noc-t2)]">{shot.title}</p>
                  {shot.camera && <p className="text-xs text-[var(--noc-t5)]">{shot.camera}</p>}
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}

      {plan.notes && plan.notes.length > 0 && (
        <details className="rounded-2xl bg-[rgba(233,233,237,0.03)] p-4">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">How this was planned</summary>
          <ul className="mt-2 space-y-1 text-xs text-[var(--noc-t5)]">
            {plan.notes.map((note, index) => (
              <li key={index}>• {note}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
