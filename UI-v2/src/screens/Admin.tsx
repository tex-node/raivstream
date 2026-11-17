import { useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronLeft, Flag } from 'lucide-react'
import { reviewQueue } from '@/lib/data'
import { cn } from '@/lib/cn'
import { BackButton, GreyButton, Logo, SolidButton, Still } from '@/components/ui'

/** Admin review queue. One decision per item: keep it up or remove it. */
export default function Admin() {
  const [gone, setGone] = useState<number[]>([])
  const [sel, setSel] = useState<number | null>(0)
  const live = reviewQueue.filter((x) => !gone.includes(x.id))
  const q = live.find((x) => x.id === sel) ?? live[0]
  // TODO: call the moderation API with the decision before removing from the list.
  const decide = () => { if (q) { setGone([...gone, q.id]); setSel(null) } }
  const reset = () => { setGone([]); setSel(0) }

  const status = (
    <span className="flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-xs text-label/80 md:text-[12px]">
      <span className="size-[7px] rounded-full bg-on" /> All systems normal
    </span>
  )
  const empty = (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-surface"><Check size={28} className="text-on" strokeWidth={2.6} /></span>
      <div className="text-xl font-semibold">Queue clear</div>
      <GreyButton size="sm" className="h-10 font-normal" onClick={reset}>Start over</GreyButton>
    </div>
  )

  return (
    <div className="flex h-dvh flex-wrap bg-ink md:bg-window">
      {/* Desktop sidebar */}
      <aside className="hidden w-[236px] shrink-0 flex-col gap-1 border-r border-hairline bg-sidebar px-3 py-5 md:flex">
        <Logo className="mx-2 mb-5 self-start" />
        <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-label-3">Admin</div>
        <span className="flex h-8 items-center justify-between rounded-[7px] bg-white/10 px-2.5 text-[13px] font-medium">Review queue<span className="text-xs text-label-2">{live.length}</span></span>
        <span className="flex h-8 items-center rounded-[7px] px-2.5 text-[13px] font-medium text-label/50">Creators</span>
        <span className="flex h-8 items-center rounded-[7px] px-2.5 text-[13px] font-medium text-label/50">System health</span>
        <div className="flex-1" />
        <Link to="/settings" className="flex h-8 items-center gap-2 rounded-[7px] px-2.5 text-[13px] text-label/70 hover:bg-white/5"><ChevronLeft size={14} /> Back to Raivstream</Link>
      </aside>

      {/* Mobile: one card at a time */}
      <div className="flex min-h-dvh w-full flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] md:hidden">
        <div className="flex items-center justify-between"><BackButton to="/settings" />{status}</div>
        <h1 className="mx-1 mt-4 text-[34px] font-bold tracking-[-.03em]">Review</h1>
        <p className="mx-1 mt-1 text-[15px] text-label-2">{live.length} left in the queue</p>
        {q ? (
          <>
            <section className="mt-[18px] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-surface">
              <Still cls={q.still} className="min-h-[220px] flex-1">
                <span className="absolute left-3.5 top-3.5 flex h-7 items-center gap-1.5 rounded-full bg-black/50 px-3 text-xs font-semibold backdrop-blur">
                  <Flag size={12} className="text-warn" strokeWidth={2.4} />{q.reports} reports
                </span>
              </Still>
              <div className="px-[18px] pb-[18px] pt-4">
                <div className="text-lg font-semibold">{q.title}</div>
                <div className="mt-1 text-[13px] text-label-2">{q.creator} · {q.where}</div>
                <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm leading-snug"><span className="text-label-2">Reason · </span>{q.reason}</div>
              </div>
            </section>
            <div className="mt-3.5 flex gap-2.5">
              <GreyButton className="flex-1 text-danger" onClick={decide}>Remove</GreyButton>
              <SolidButton className="flex-1" onClick={decide}>Keep it up</SolidButton>
            </div>
          </>
        ) : empty}
      </div>

      {/* Desktop: list + detail */}
      <div className="hidden h-dvh min-w-0 flex-1 flex-col md:flex">
        <header className="flex min-h-14 items-center justify-between border-b border-hairline px-5 py-2.5">
          <span className="text-sm font-semibold">Review queue</span>{status}
        </header>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Queue" className="w-[300px] shrink-0 overflow-y-auto border-r border-hairline p-3">
            {live.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={cn('mb-1 flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors', q?.id === x.id ? 'bg-white/10' : 'hover:bg-white/5')}>
                <Still cls={x.still} className="h-[52px] w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{x.title}</span>
                  <span className="block truncate text-xs text-label-2">{x.reason}</span>
                </span>
                <span className="text-xs text-label-2">{x.reports}</span>
              </button>
            ))}
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto px-9 py-7">
            {q ? (
              <div className="mx-auto flex max-w-[760px] flex-wrap gap-7">
                <Still cls={q.still} className="aspect-[9/16] w-[300px] rounded-[22px]" />
                <div className="flex min-w-[280px] flex-1 flex-col">
                  <h1 className="text-[26px] font-bold tracking-tight">{q.title}</h1>
                  <div className="mt-1 text-sm text-label-2">{q.creator} · {q.where}</div>
                  <div className="mt-5 overflow-hidden rounded-xl bg-surface">
                    {[['Reason', q.reason], ['Reports', String(q.reports)], ['Posted', q.posted]].map(([k, v], i) => (
                      <div key={k} className={cn('flex justify-between gap-4 px-3.5 py-3 text-sm', i > 0 && 'hairline-top')}><span className="text-label-2">{k}</span><span className="text-right">{v}</span></div>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <div className="mt-6 flex gap-2.5">
                    <GreyButton size="sm" className="h-11 flex-1 text-[15px] text-danger" onClick={decide}>Remove</GreyButton>
                    <SolidButton size="sm" className="h-11 flex-1 text-[15px]" onClick={decide}>Keep it up</SolidButton>
                  </div>
                </div>
              </div>
            ) : empty}
          </main>
        </div>
      </div>
    </div>
  )
}
