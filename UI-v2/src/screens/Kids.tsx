import { useState } from 'react'
import { Link } from 'react-router'
import { Lock, Play } from 'lucide-react'
import { kids } from '@/lib/data'
import { ChipRow, Still } from '@/components/ui'

const cats = ['All', 'Stories', 'Learn', 'Songs'] as const
type Cat = (typeof cats)[number]

/** R16 Kids: its own full-screen layout — no adult navigation, parents exit via the lock. */
export default function Kids() {
  const [c, setC] = useState<Cat>('All')
  const items = kids.filter((x) => c === 'All' || x.cat === c)

  return (
    <div className="min-h-dvh bg-ink px-4 pb-14 pt-[max(20px,env(safe-area-inset-top))] md:px-10" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Geist', system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center justify-between px-1 md:px-0">
          <h1 className="text-[34px] font-bold tracking-[-.03em] md:text-5xl">Hi, Kemi</h1>
          {/* TODO: require the parent's password / Face ID before leaving. */}
          <Link to="/settings" aria-label="Parent controls" className="flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold text-label/80 md:h-10 md:px-4 md:text-sm">
            <Lock size={14} strokeWidth={2.4} /> Parents
          </Link>
        </div>
        <p className="mx-1 mt-1 text-[15px] text-label-2 md:mx-0 md:mt-1.5 md:text-lg">R16 Kids · safe for ages 4–12</p>

        <Link to="/watch" className="kids-sun relative mt-5 block h-[220px] overflow-hidden rounded-[28px] shadow-[inset_0_0_0_.5px_rgb(255_255_255/.12)] md:mt-7 md:h-[340px] md:rounded-[36px]">
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-b from-transparent to-black/65 px-5 pb-[18px] pt-10 md:px-8 md:pb-7 md:pt-16">
            <div>
              <div className="text-[13px] font-semibold text-white/75 md:text-[15px]">Keep watching</div>
              <div className="mt-0.5 text-[22px] font-bold tracking-tight md:mt-1 md:text-4xl">Max Goes to School</div>
            </div>
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-label text-[#0a0a0c] md:size-20">
              <Play size={26} fill="currentColor" strokeWidth={0} />
            </span>
          </div>
        </Link>

        <ChipRow big options={[...cats]} value={c} onChange={setC} className="-mx-4 mt-6 px-4 md:mx-0 md:mt-8 md:flex-wrap md:px-0" />

        <div className="mt-4 grid grid-cols-2 gap-3.5 md:mt-6 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-[22px]">
          {items.map((it) => (
            <div key={it.title} className="flex flex-col gap-2 md:gap-2.5">
              <Still cls={it.still} className="h-[150px] rounded-3xl md:aspect-[4/3] md:h-auto md:rounded-[30px]">
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold backdrop-blur md:left-3.5 md:top-3.5 md:text-[13px]">{it.age}</span>
              </Still>
              <div className="px-1 text-base font-semibold md:text-[19px]">{it.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
