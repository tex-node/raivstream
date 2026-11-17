import { useState } from 'react'
import { ledger, packs, user } from '@/lib/data'
import { cn } from '@/lib/cn'
import { BackButton, Group, GroupLabel, SolidButton } from '@/components/ui'

export default function Credits() {
  const [sel, setSel] = useState(1)
  const cur = packs[sel]
  // TODO: hand cur off to the payment provider checkout.
  const buy = () => {}

  return (
    <div className="relative min-h-full">
      <div className="mx-auto max-w-[900px] px-4 pb-32 pt-[max(16px,env(safe-area-inset-top))] md:px-10 md:pb-14 md:pt-14">
        <div className="md:hidden"><BackButton to="/settings" /></div>
        <h1 className="mx-1 mt-4 text-[34px] font-bold tracking-[-.03em] md:mx-0 md:mt-0 md:text-[40px] md:tracking-[-.035em]">Credits</h1>

        <section className="relative mt-[18px] overflow-hidden rounded-3xl bg-surface px-5 py-[22px] md:mt-6 md:px-[30px] md:py-7">
          <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f7d2ff_0,#d46bf0_35%,#3fd0e6_85%)] opacity-55 md:-right-15 md:-top-20 md:size-[260px] md:opacity-50" />
          <div className="relative">
            <div className="text-[13px] text-label-2 md:text-sm">Balance</div>
            <div className="mt-0.5 text-[46px] font-bold leading-[1.05] tracking-[-.035em] md:mt-1 md:text-6xl md:tracking-[-.04em]">{user.credits.toLocaleString()}</div>
            <div className="text-sm text-label/70 md:text-[15px]">About {Math.floor(user.credits / 50)} scenes left<span className="hidden md:inline"> · 50 credits per scene</span></div>
          </div>
        </section>

        <GroupLabel>Top up</GroupLabel>
        <div role="radiogroup" aria-label="Credit packs" className="flex flex-col gap-2.5 md:grid md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:gap-3.5">
          {packs.map((p, i) => (
            <button key={p.amount} role="radio" aria-checked={sel === i} onClick={() => setSel(i)}
              className={cn('flex min-h-[68px] items-center justify-between rounded-2xl border-2 bg-surface px-4 py-3 text-left transition-colors md:flex-col md:items-start md:gap-1 md:rounded-[18px] md:p-5',
                sel === i ? 'border-violet' : 'border-transparent hover:border-white/10')}>
              <span className="hidden text-[13px] text-label-2 md:block">{p.tag}</span>
              <span className="flex flex-col gap-0.5 md:contents">
                <span className="text-[17px] font-semibold md:text-[28px] md:font-bold md:tracking-tight">{p.amount}<span className="md:hidden"> credits</span></span>
                <span className="text-[13px] text-label-2">{p.note}{i === 1 && <span className="md:hidden"> · most popular</span>}</span>
              </span>
              <span className="text-[15px] font-semibold md:mt-3 md:text-base">{p.price}</span>
            </button>
          ))}
        </div>
        <div className="mt-[18px] hidden justify-end md:flex">
          <SolidButton size="sm" className="h-11 px-[26px] text-[15px]" onClick={buy}>Buy {cur.amount} credits</SolidButton>
        </div>

        <GroupLabel>Recent</GroupLabel>
        <Group>
          {ledger.map((l, i) => (
            <div key={i} className={cn('flex justify-between px-4 py-[13px] text-[15px] md:px-[18px] md:text-sm', i > 0 && 'hairline-top')}>
              <span className="flex-1">{l.label}</span>
              <span className="hidden flex-1 text-label-3 md:block">{l.when}</span>
              <span className={cn('w-20 text-right', l.amount > 0 ? 'text-good' : 'text-label-2')}>{l.amount > 0 ? '+' : '−'}{Math.abs(l.amount).toLocaleString()}</span>
            </div>
          ))}
        </Group>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-b from-transparent to-ink to-35% px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 md:hidden">
        <SolidButton className="w-full" onClick={buy}>Buy {cur.amount} credits</SolidButton>
      </div>
    </div>
  )
}
