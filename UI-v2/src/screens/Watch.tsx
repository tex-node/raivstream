import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Heart, MessageCircle, Share } from 'lucide-react'
import { feed } from '@/lib/data'
import { cn } from '@/lib/cn'
import { CircleButton, Still } from '@/components/ui'

function Action({ label, count, onClick, children }: { label: string; count: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1 text-xs font-semibold">
      <span className="flex size-12 items-center justify-center rounded-full bg-[rgb(40_40_44/.55)] backdrop-blur-lg md:bg-surface">{children}</span>
      {count}
    </button>
  )
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}K` : String(n))

export default function Watch() {
  const [i, setI] = useState(0)
  const [tab, setTab] = useState<'Following' | 'For you'>('For you')
  const [liked, setLiked] = useState<Record<number, boolean>>({})
  const v = feed[i]
  const on = !!liked[i]
  const next = () => setI((i + 1) % feed.length)
  const prev = () => setI((i + feed.length - 1) % feed.length)

  const actions = (
    <>
      <Action label="Like" count={fmt(v.likes + (on ? 1 : 0))} onClick={() => setLiked({ ...liked, [i]: !on })}>
        <Heart size={24} className={on ? 'fill-pink text-pink' : ''} />
      </Action>
      <Action label="Comments" count={v.comments}><MessageCircle size={22} /></Action>
      <Action label="Share" count="Share"><Share size={22} /></Action>
    </>
  )

  return (
    <div className="relative h-dvh bg-ink md:flex md:h-full md:items-center md:justify-center md:gap-5 md:p-6">
      <div className="absolute inset-x-0 top-[max(20px,env(safe-area-inset-top))] z-10 flex justify-center gap-6">
        {(['Following', 'For you'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('py-1.5 text-base', tab === t ? 'font-bold shadow-[inset_0_-2px_0_#f5f5f7]' : 'font-medium text-label-2')}>
            {t}
          </button>
        ))}
      </div>

      {/* Video — swap Still for a <video> element with the real stream */}
      <Still cls={v.still} className="absolute inset-0 md:relative md:inset-auto md:mt-9 md:aspect-[9/16] md:h-[calc(100%-40px)] md:max-h-[800px] md:rounded-3xl">
        <button aria-label="Next video" onClick={next} className="absolute inset-0 md:hidden" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/.45)_0%,transparent_22%,transparent_55%,rgb(0_0_0/.75)_100%)]" />
        <div className="absolute bottom-[118px] left-4 right-20 md:bottom-6 md:left-5 md:right-5">
          <div className="flex items-center gap-2.5">
            <span className="bg-brand-diag flex size-[34px] items-center justify-center rounded-full text-[13px] font-bold text-[#0a0a0c]">{v.initial}</span>
            <span className="text-[15px] font-semibold">{v.creator}</span>
            <button className="h-7 rounded-full border border-white/50 px-3 text-[13px] font-semibold">Follow</button>
          </div>
          <p className="mt-2.5 text-[15px] leading-snug">{v.caption}</p>
          <div className="mt-2 text-xs text-label/70">{v.meta}</div>
          <div className="mt-3 h-0.5 rounded-full bg-white/20"><div className="h-full w-[38%] rounded-full bg-label" /></div>
        </div>
      </Still>

      <div className="absolute bottom-[200px] right-3 flex flex-col items-center gap-[18px] md:static md:mt-9">{actions}</div>

      <div className="absolute right-7 top-1/2 hidden -translate-y-1/2 flex-col gap-2.5 md:flex">
        <CircleButton label="Previous" onClick={prev} className="size-11"><ChevronUp size={20} /></CircleButton>
        <CircleButton label="Next" onClick={next} className="size-11"><ChevronDown size={20} /></CircleButton>
      </div>
    </div>
  )
}
