import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ---------- Buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'lg' | 'sm' }

/** The one gradient button. Use at most once per screen. */
export function PrimaryButton({ size = 'lg', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        'bg-brand inline-flex items-center justify-center gap-2 rounded-full font-semibold text-[#0a0a0c] transition-[opacity,transform] active:scale-[.98] disabled:opacity-55',
        size === 'lg' ? 'h-[54px] px-6 text-[17px]' : 'h-[34px] px-4 text-[13px]',
        className,
      )}
    />
  )
}

/** White pill — the main action where the gradient would be too loud. */
export function SolidButton({ size = 'lg', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-label font-semibold text-[#0a0a0c] transition-transform active:scale-[.98]',
        size === 'lg' ? 'h-[54px] px-6 text-[17px]' : 'h-[34px] px-4 text-[13px]',
        className,
      )}
    />
  )
}

export function GreyButton({ size = 'lg', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-surface-2 font-semibold transition-transform active:scale-[.98]',
        size === 'lg' ? 'h-[54px] px-6 text-[17px]' : 'h-[34px] px-4 text-[13px]',
        className,
      )}
    />
  )
}

export function CircleButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button aria-label={label} onClick={onClick} className={cn('flex size-10 items-center justify-center rounded-full bg-surface transition-colors hover:bg-surface-2', className)}>
      {children}
    </button>
  )
}

export function BackButton({ to }: { to?: string }) {
  const nav = useNavigate()
  return (
    <CircleButton label="Back" onClick={() => (to ? nav(to) : nav(-1))}>
      <ChevronLeft size={20} strokeWidth={2.4} />
    </CircleButton>
  )
}

/* ---------- Segmented control (Apple style) ---------- */

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', className,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'md' | 'sm'; className?: string }) {
  return (
    <div role="tablist" className={cn('grid rounded-[10px] bg-surface p-0.5', size === 'sm' && 'rounded-lg bg-white/[.07]', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg px-3 transition-colors',
              size === 'md' ? 'h-8 text-[13px]' : 'h-[26px] rounded-md text-xs',
              on ? 'bg-fill font-semibold text-label' : 'font-medium text-label-2 hover:text-label',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Pill chips for filters. Selected = white. */
export function ChipRow<T extends string>({ options, value, onChange, className, big }: { options: T[]; value: T; onChange: (v: T) => void; className?: string; big?: boolean }) {
  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            'shrink-0 rounded-full font-medium transition-colors',
            big ? 'h-11 px-5 text-base font-semibold md:h-[52px] md:px-6 md:text-lg' : 'h-[34px] px-4 text-sm',
            o === value ? 'bg-label text-[#0a0a0c]' : 'bg-surface text-label-2 hover:text-label',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/* ---------- Grouped list (Apple Settings style) ---------- */

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-[14px] bg-surface', className)}>{children}</div>
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <h2 className="mx-1 mb-2 mt-6 text-[13px] font-medium text-label-2">{children}</h2>
}

export function LinkRow({ to, label, value, first, danger }: { to: string; label: string; value?: ReactNode; first?: boolean; danger?: boolean }) {
  return (
    <Link to={to} className={cn('flex h-[50px] items-center justify-between px-4 text-base transition-colors hover:bg-white/[.03] md:h-[46px] md:text-sm', !first && 'hairline-top', danger && 'text-danger')}>
      {label}
      {!danger && (
        <span className="flex items-center gap-2 text-label-2">
          {value}
          <ChevronRight size={16} className="text-label-3" />
        </span>
      )}
    </Link>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn('flex h-[31px] w-[51px] shrink-0 rounded-full p-0.5 transition-colors md:h-[22px] md:w-[38px]', on ? 'justify-end bg-on' : 'justify-start bg-[#39393d]')}
    >
      <span className="size-[27px] rounded-full bg-white shadow md:size-[18px]" />
    </button>
  )
}

/* ---------- Media + identity ---------- */

export function Still({ cls, className, children }: { cls: string; className?: string; children?: ReactNode }) {
  // Positioned by the caller when it passes absolute/fixed; otherwise relative so overlays anchor to it.
  const pos = /(^|\s)(absolute|fixed)(\s|$)/.test(className ?? '') ? '' : 'relative'
  return <div className={cn(cls, pos, 'overflow-hidden shadow-[inset_0_0_0_.5px_rgb(255_255_255/.1)]', className)}>{children}</div>
}

export function Avatar({ initials = 'AM', size = 34, className }: { initials?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6b5bd6] to-[#2c8fb0] font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

export function Orb({ size = 84 }: { size?: number }) {
  return <div aria-hidden className="orb shrink-0 rounded-full" style={{ width: size, height: size }} />
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-[3px] overflow-hidden rounded-full bg-white/10', className)}>
      <div className="h-full bg-gradient-to-r from-violet to-cyan transition-[width] duration-400" style={{ width: `${value}%` }} />
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return <img src="/raivstream-logo.png" alt="Raivstream" className={cn('h-5 w-auto', className)} />
}

export function AppleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.7c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.7 1.3-2.7s-2.4-1-2.4-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" />
    </svg>
  )
}
