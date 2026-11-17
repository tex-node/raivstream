import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown, Sparkles } from 'lucide-react'
import ProjectFrame from '@/components/ProjectFrame'
import { GreyButton, PrimaryButton, Still } from '@/components/ui'
import { directions, generationSteps, scenes } from '@/lib/data'
import { cn } from '@/lib/cn'

type Gen = 'idle' | 'running' | 'review'

/**
 * Scene Director. Generation is mocked with timers;
 * replace run() with the real job and drive label/pct from its status events.
 */
function useGeneration() {
  const [gen, setGen] = useState<Gen>('idle')
  const [pct, setPct] = useState(0)
  const [label, setLabel] = useState('')
  const timers = useRef<number[]>([])
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])

  const run = () => {
    clear()
    setGen('running'); setPct(4); setLabel(generationSteps[0][1])
    generationSteps.forEach(([ms, l, p]) => timers.current.push(window.setTimeout(() => { setLabel(l); setPct(p) }, ms)))
    timers.current.push(window.setTimeout(() => { setGen('review'); setPct(100) }, 3900))
  }
  const keep = () => { setGen('idle'); setPct(0) }
  return { gen, pct, label, run, keep }
}

export default function Director() {
  const { gen, pct, label, run, keep } = useGeneration()
  const [picks, setPicks] = useState<Record<string, number>>(() => Object.fromEntries(Object.keys(directions).map((k) => [k, 0])))
  const active = 2
  const scene = scenes[active]

  const cta = gen === 'running' ? `Creating… ${pct}%` : 'Generate scene'
  const desktopAction = gen === 'review'
    ? <><GreyButton size="sm" onClick={run}>Redo</GreyButton><PrimaryButton size="sm" onClick={keep}>Keep this take</PrimaryButton></>
    : <PrimaryButton size="sm" onClick={run} disabled={gen === 'running'}><Sparkles size={14} fill="currentColor" />{cta}</PrimaryButton>
  const mobileAction = gen === 'review'
    ? <><GreyButton className="w-28" onClick={run}>Redo</GreyButton><PrimaryButton className="flex-1" onClick={keep}>Keep this take</PrimaryButton></>
    : <PrimaryButton className="flex-1" onClick={run} disabled={gen === 'running'}><Sparkles size={18} fill="currentColor" />{cta}</PrimaryButton>

  return (
    <ProjectFrame tab="scenes" subtitle={`Scene ${active + 1} of ${scenes.length}`} fill action={desktopAction} mobileAction={mobileAction}>
      <div className="md:flex md:h-full md:flex-wrap">
        <div className="flex flex-col gap-3 px-4 pt-1 md:h-full md:min-w-0 md:flex-[999_1_480px] md:gap-[18px] md:overflow-y-auto md:px-10 md:py-8">
          <Still cls={scene.still} className="aspect-[16/10] w-full rounded-[22px] md:aspect-video md:rounded-[20px]">
            <div className="absolute bottom-3 left-3.5 flex items-baseline gap-2 [text-shadow:0_1px_10px_rgb(0_0_0/.6)] md:bottom-[18px] md:left-5 md:gap-2.5">
              <span className="text-xs font-semibold text-white/70 md:text-[13px]">{scene.n}</span>
              <span className="text-[17px] font-semibold md:text-[22px] md:tracking-tight">{scene.title}</span>
            </div>
            {gen === 'review' && <span className="absolute left-3 top-3 rounded-full bg-label px-2.5 py-1 text-xs font-semibold text-[#0a0a0c] md:left-4 md:top-4">New take</span>}
            {gen === 'running' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-black/60 backdrop-blur-lg" role="status" aria-live="polite">
                <span className="text-[15px] font-medium md:text-[17px]">{label}</span>
                <div className="h-1 w-3/5 overflow-hidden rounded-full bg-white/15 md:w-2/5">
                  <div className="h-full bg-gradient-to-r from-violet to-cyan transition-[width] duration-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </Still>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-6 md:gap-2.5 md:px-0">
            {scenes.map((s, i) => (
              <div key={s.n} className="flex shrink-0 flex-col gap-1.5">
                <Still cls={s.still} className={cn('h-11 w-16 rounded-[10px] md:aspect-[16/10] md:h-auto md:w-auto', i === active ? 'ring-2 ring-violet ring-offset-2 ring-offset-ink md:ring-offset-window' : 'opacity-70')}>
                  <span className="absolute bottom-1 left-1.5 text-[11px] font-semibold md:hidden">{s.n}</span>
                </Still>
                <span className={cn('hidden text-xs md:block', i === active ? 'text-label' : 'text-label-2')}>{s.n} · {s.title}</span>
              </div>
            ))}
          </div>
        </div>

        <aside aria-label="Direct this scene" className="px-4 pb-6 md:h-full md:max-w-full md:flex-[1_1_320px] md:overflow-y-auto md:border-l md:border-hairline md:bg-panel md:px-5 md:py-6">
          <h2 className="mx-1 mb-2 mt-6 text-[13px] font-medium text-label-2 md:mx-0 md:mt-0 md:text-[15px] md:font-semibold md:text-label">Direct this scene</h2>
          <p className="mb-4 hidden text-xs text-label-2 md:block">Click a value to change it.</p>
          <div className="overflow-hidden rounded-[14px] bg-surface md:rounded-xl">
            {Object.entries(directions).map(([k, opts], i) => (
              <button key={k}
                onClick={() => setPicks({ ...picks, [k]: (picks[k] + 1) % opts.length })}
                className={cn('flex h-[50px] w-full items-center justify-between px-4 transition-colors hover:bg-white/[.03] md:h-11 md:px-3.5', i > 0 && 'hairline-top', k === 'Weather' && 'max-md:hidden')}>
                <span className="text-base md:text-sm">{k}</span>
                <span className="flex items-center gap-1.5 text-base text-label-2 md:text-sm">{opts[picks[k]]}<ChevronsUpDown size={13} className="text-label-3" /></span>
              </button>
            ))}
          </div>
          <h3 className="mb-2 mt-6 hidden text-xs font-medium text-label-2 md:block">In this scene</h3>
          <div className="hidden gap-2 md:flex">
            {['Max', 'Luna'].map((n) => <span key={n} className="flex h-[30px] items-center rounded-full bg-surface px-3 text-[13px]">{n}</span>)}
          </div>
        </aside>
      </div>
    </ProjectFrame>
  )
}
