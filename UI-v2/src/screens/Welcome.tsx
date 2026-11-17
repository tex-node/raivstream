import { useState } from 'react'
import { Link } from 'react-router'
import { AppleGlyph, Logo, Orb, Segmented, Still } from '@/components/ui'

type Role = 'watch' | 'create'

export default function Welcome() {
  const [role, setRole] = useState<Role>('watch')
  const next = role === 'watch' ? '/watch' : '/create'

  return (
    <div className="flex min-h-dvh flex-wrap bg-ink">
      {/* Visual — full side on desktop, orb on mobile */}
      <section aria-hidden className="relative hidden min-h-[520px] flex-[1_1_520px] items-center justify-center overflow-hidden bg-[#0a0a0c] md:flex">
        <Still cls="still-gate" className="absolute left-[12%] top-[16%] h-[356px] w-[200px] -rotate-8 rounded-[28px] opacity-75 shadow-2xl" />
        <Still cls="still-night" className="absolute right-[12%] top-[12%] h-[356px] w-[200px] rotate-7 rounded-[28px] opacity-75 shadow-2xl" />
        <Still cls="still-green" className="absolute -bottom-30 left-1/2 h-[356px] w-[200px] -translate-x-1/2 -rotate-2 rounded-[28px] opacity-60" />
        <Orb size={180} />
      </section>

      <section className="flex min-h-dvh flex-[1_1_480px] flex-col px-6 pb-10 md:items-center md:justify-center md:px-12">
        <div className="flex w-full max-w-[380px] flex-1 flex-col md:flex-none">
          <div className="flex flex-1 flex-col items-center justify-center text-center md:flex-none md:items-start md:text-left">
            <div className="md:hidden"><Orb size={132} /></div>
            <Logo className="mt-12 h-[26px] md:mt-0 md:h-7" />
            <h1 className="mt-6 text-[30px] font-semibold leading-[1.1] tracking-[-.025em] md:text-[44px]">Your story,<br />on screen.</h1>
            <p className="mt-3 max-w-[290px] text-base leading-snug text-label-2 md:max-w-none md:text-[17px]">
              Watch short films from African and global creators — or make your own.
            </p>
          </div>

          <div className="mt-8">
            <Segmented
              options={[{ value: 'watch', label: 'I’m here to watch' }, { value: 'create', label: 'I’m a creator' }]}
              value={role}
              onChange={setRole}
              className="[&>button]:h-10 [&>button]:text-[15px]"
            />
            {/* TODO: wire to Supabase auth (Apple + email magic link). */}
            <Link to={next} className="mt-4 flex h-[54px] items-center justify-center gap-2.5 rounded-full bg-label text-[17px] font-semibold text-[#0a0a0c] md:h-[50px] md:text-base">
              <AppleGlyph /> Continue with Apple
            </Link>
            <Link to={next} className="mt-2.5 flex h-[54px] items-center justify-center rounded-full bg-surface text-[17px] font-semibold md:h-[50px] md:text-base">
              Continue with email
            </Link>
            <p className="mt-4 text-center text-xs leading-normal text-label-3 md:text-left">By continuing you agree to the Terms and Privacy Policy.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
