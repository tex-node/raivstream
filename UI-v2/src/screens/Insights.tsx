import { useState } from 'react'
import { insights, topFilms } from '@/lib/data'
import { cn } from '@/lib/cn'
import { BackButton, Segmented, Still } from '@/components/ui'

type Range = '7D' | '28D' | '90D'
const ranges = (['7D', '28D', '90D'] as Range[]).map((v) => ({ value: v, label: v }))

const stats = [
  { label: 'New followers', short: 'Followers', value: '+1,204' },
  { label: 'Avg. watch time', short: 'Avg. watch', value: '1:32' },
  { label: 'Watched to the end', short: 'Finished', value: '64%' },
  { label: 'Shares', short: 'Shares', value: '2,310' },
]

export default function Insights() {
  const [r, setR] = useState<Range>('28D')
  const [hover, setHover] = useState<number | null>(null)
  const data = insights[r]
  const max = Math.max(...data.v)
  const pick = (v: Range) => { setR(v); setHover(null) }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 hidden min-h-14 items-center gap-4 border-b border-hairline bg-window/90 px-5 py-2.5 backdrop-blur-xl md:flex">
        <span className="flex-1 text-sm font-semibold">Insights</span>
        <Segmented options={ranges} value={r} onChange={pick} size="sm" className="w-[210px]" />
        <span className="flex-1" />
      </header>

      <div className="mx-auto flex max-w-[1080px] flex-col px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] md:gap-[18px] md:p-8">
        <div className="flex items-center justify-between md:hidden">
          <BackButton to="/settings" />
          <Segmented options={ranges} value={r} onChange={pick} className="w-[180px]" />
        </div>
        <h1 className="mx-1 mt-4 text-[34px] font-bold tracking-[-.03em] md:hidden">Insights</h1>

        <section className="mt-4 rounded-[20px] bg-surface px-4 pb-3.5 pt-[18px] md:mt-0 md:px-6 md:pb-[18px] md:pt-6">
          <div className="flex flex-wrap items-start justify-between gap-x-4">
            <div>
              <div className="text-[13px] text-label-2">Views</div>
              <div className="mt-0.5 flex items-baseline gap-2.5">
                <span className="text-[40px] font-bold tracking-[-.03em] md:text-5xl">{data.total}</span>
                <span className="text-sm font-semibold text-good md:text-[15px]">▲ {data.delta}</span>
              </div>
            </div>
            <div className="h-5 pt-1.5 text-xs text-label/75 md:text-[13px]" aria-live="polite">
              {hover === null ? 'Tap or hover a bar for the day’s views' : `${data.v[hover].toFixed(1)}K views`}
            </div>
          </div>
          {/* Single series, one hue. Selected bar stays full colour, the rest dim. */}
          <div role="img" aria-label={`Daily views, ${data.start} to today`} onMouseLeave={() => setHover(null)}
            className="mt-2 flex h-[130px] items-end gap-0.5 border-b border-label/20 md:mt-[18px] md:h-[220px] md:bg-[linear-gradient(rgb(235_235_245/.06)_1px,transparent_1px)] md:bg-[length:100%_55px]">
            {data.v.map((x, i) => (
              <button key={i} aria-label={`${x.toFixed(1)}K views`} onClick={() => setHover(hover === i ? null : i)} onMouseEnter={() => setHover(i)} className="flex h-full flex-1 items-end">
                <span className={cn('block w-full rounded-t transition-colors', hover === null || hover === i ? 'bg-violet' : 'bg-violet/35')} style={{ height: `${Math.round((x / max) * 100)}%` }} />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-label-3 md:mt-2 md:text-xs"><span>{data.start}</span><span>Today</span></div>
        </section>

        <div className="mt-3 grid grid-cols-3 gap-2.5 md:mt-0 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-3.5">
          {stats.map((s, i) => (
            <div key={s.label} className={cn('rounded-2xl bg-surface p-3 md:px-[18px] md:py-4', i === 3 && 'hidden md:block')}>
              <div className="text-xs text-label-2 md:text-[13px]"><span className="md:hidden">{s.short}</span><span className="hidden md:inline">{s.label}</span></div>
              <div className="mt-1 text-xl font-bold md:text-[26px]">{s.value}</div>
            </div>
          ))}
        </div>

        <h2 className="mx-1 mb-2.5 mt-6 text-xl font-semibold tracking-tight md:hidden">Top films</h2>
        <section className="overflow-hidden rounded-2xl bg-surface">
          <div className="hidden px-[18px] py-3.5 text-[15px] font-semibold md:block">Top films</div>
          {topFilms.map((f, i) => (
            <div key={f.title} className={cn('flex items-center gap-3 px-3 py-2.5 md:gap-3.5 md:px-[18px]', (i > 0) && 'hairline-top', 'md:hairline-top')}>
              <Still cls={f.still} className="h-14 w-11 shrink-0 rounded-lg md:h-12 md:w-9 md:rounded-[7px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium md:text-sm">{f.title}</div>
                <div className="mt-0.5 text-xs text-label-2 md:hidden">{f.kind}</div>
              </div>
              <span className="hidden w-[120px] text-[13px] text-label-2 md:block">{f.kind}</span>
              <span className="w-20 text-right text-[15px] font-semibold md:text-sm">{f.views}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
