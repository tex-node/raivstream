import { useState } from 'react'
import { Plus } from 'lucide-react'
import ProjectFrame from '@/components/ProjectFrame'
import { SolidButton, Still } from '@/components/ui'
import { cast } from '@/lib/data'
import { cn } from '@/lib/cn'

export default function Cast() {
  const [sel, setSel] = useState(0)
  const cur = cast[sel]

  return (
    <ProjectFrame
      tab="cast"
      subtitle={`${cast.length} characters`}
      fill
      action={<SolidButton size="sm"><Plus size={14} strokeWidth={2.6} /> New character</SolidButton>}
      mobileAction={null}
    >
      <div className="md:flex md:h-full md:flex-wrap">
        <div className="px-4 pb-[330px] pt-2 md:h-full md:min-w-0 md:flex-[999_1_420px] md:overflow-y-auto md:p-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] md:gap-[18px]">
            {cast.map((c, i) => (
              <button key={c.name} onClick={() => setSel(i)} aria-label={c.name} aria-pressed={sel === i}
                className={cn('rounded-[21px] p-[3px] transition-colors', sel === i ? 'bg-brand-diag' : 'bg-transparent hover:bg-white/10')}>
                <Still cls={c.portrait} className="flex h-[200px] items-center justify-center rounded-[18px] md:aspect-[3/4] md:h-auto">
                  <span className="text-[56px] font-semibold tracking-tight text-white/20 md:text-[72px]">{c.initial}</span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent to-black/70 px-3 pb-3 pt-8 text-left md:px-3.5 md:pb-3.5 md:pt-9">
                    <span className="block text-base font-semibold md:text-[17px]">{c.name}</span>
                    <span className="mt-0.5 block text-xs text-label/70">{c.role}</span>
                  </span>
                </Still>
              </button>
            ))}
          </div>
        </div>

        {/* Detail: bottom sheet on mobile, inspector panel on desktop */}
        <section aria-label="Character details"
          className="glass fixed inset-x-2 bottom-2 z-20 rounded-[36px] px-[22px] pb-7 pt-2.5 md:static md:z-auto md:h-full md:max-w-full md:flex-[1_1_340px] md:overflow-y-auto md:rounded-none md:border-l md:border-hairline md:bg-panel md:px-6 md:py-7 md:shadow-none md:backdrop-blur-none">
          <div className="mx-auto mb-3.5 h-[5px] w-9 rounded-full bg-label/30 md:hidden" />
          <Still cls={cur.portrait} className="hidden h-[180px] items-center justify-center rounded-2xl md:flex">
            <span className="text-[64px] font-semibold text-white/20">{cur.initial}</span>
          </Still>
          <div className="flex items-baseline justify-between md:block">
            <h2 className="text-[22px] font-semibold tracking-tight md:mt-5 md:text-2xl">{cur.name}</h2>
            <span className="text-[13px] text-label-2 md:mt-1 md:block">
              <span className="hidden md:inline">{cur.role} · </span>In {cur.scenes}
            </span>
          </div>
          <dl className="mt-3.5 md:mt-5 md:overflow-hidden md:rounded-xl md:bg-surface">
            {cur.traits.map((t, i) => (
              <div key={t.k} className={cn('flex gap-3.5 border-t border-sep py-3 md:block md:border-0 md:px-3.5', i === 3 && 'hidden md:block', i > 0 && 'md:hairline-top')}>
                <dt className="w-[92px] shrink-0 text-sm text-label-2 md:w-auto md:text-xs">{t.k}</dt>
                <dd className="text-sm leading-snug md:mt-1">{t.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3.5 hidden text-xs leading-normal text-label-3 md:block">Click any line to edit. Every scene keeps {cur.name} consistent.</p>
        </section>
      </div>
    </ProjectFrame>
  )
}
