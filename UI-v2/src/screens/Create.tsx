import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowUp } from 'lucide-react'
import { projects, user } from '@/lib/data'
import { cn } from '@/lib/cn'
import { Avatar, Logo, Orb, Progress, Still } from '@/components/ui'

const kinds = {
  Story: 'A small dog decides to go to school…',
  Advert: 'A 30-second ad for my coffee brand…',
  'Short film': 'A tense rooftop chase at dusk…',
} as const
type Kind = keyof typeof kinds

export default function Create() {
  const [kind, setKind] = useState<Kind>('Story')
  const [idea, setIdea] = useState('')
  const nav = useNavigate()
  // TODO: POST the idea + kind to the story generator, then open the new project.
  const start = () => nav('/project/dog/story')

  return (
    <div className="flex min-h-full flex-col px-5 pb-32 pt-[max(20px,env(safe-area-inset-top))] md:items-center md:px-12 md:pb-14 md:pt-24">
      <div className="flex items-center justify-between md:hidden">
        <Logo className="h-[18px]" />
        <Link to="/settings" aria-label="Account"><Avatar initials={user.initials} /></Link>
      </div>

      <div className="mt-9 flex flex-col items-center text-center md:mt-0">
        <div className="md:hidden"><Orb size={84} /></div>
        <div className="hidden md:block"><Orb size={96} /></div>
        <h1 className="mt-7 text-[30px] font-semibold leading-[1.12] tracking-[-.025em] md:mt-8 md:text-[46px] md:tracking-[-.035em]">
          What are we<br className="md:hidden" /> making today?
        </h1>
        <p className="mt-2 text-[15px] text-label-2 md:mt-2.5 md:text-[17px]">Good evening, Ada.<span className="hidden md:inline"> Describe it — we’ll write, cast and shoot it.</span></p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); start() }} className="mt-7 flex w-full items-center gap-2 rounded-[28px] bg-surface py-1.5 pl-5 pr-1.5 shadow-[inset_0_0_0_.5px_rgb(255_255_255/.08)] md:mt-9 md:max-w-[680px] md:rounded-[32px] md:py-2 md:pl-6 md:pr-2 md:shadow-[inset_0_0_0_.5px_rgb(255_255_255/.1),0_20px_60px_rgb(0_0_0/.35)]">
        <label htmlFor="idea" className="sr-only">Describe your idea</label>
        <input id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={kinds[kind]} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3 md:h-12 md:text-[17px]" />
        <button aria-label="Start" className="bg-brand flex size-11 shrink-0 items-center justify-center rounded-full text-[#0a0a0c] md:size-12">
          <ArrowUp size={20} strokeWidth={2.6} />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap justify-center gap-2 md:mt-3.5">
        {(Object.keys(kinds) as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('h-9 rounded-full px-4 text-sm font-medium transition-colors', kind === k ? 'bg-label text-[#0a0a0c]' : 'border border-label/15 text-label-2 hover:text-label')}>
            {k}
          </button>
        ))}
      </div>

      <section className="mt-10 w-full md:mt-[72px] md:max-w-[980px]">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Continue</h2>
          <Link to="/library" className="text-[13px] text-label-2 hover:text-label">See all</Link>
        </div>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-3 md:gap-[18px] md:px-0">
          {projects.map((p) => (
            <Link key={p.id} to={`/project/${p.id}/story`} className="flex w-[150px] shrink-0 flex-col gap-2.5 md:w-auto">
              <Still cls={p.still} className="h-[190px] rounded-[20px] md:aspect-[16/10] md:h-auto md:rounded-2xl">
                <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold backdrop-blur md:hidden">{p.badge}</span>
              </Still>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-medium leading-tight">{p.title}</span>
                <span className="hidden shrink-0 text-xs text-label-2 md:inline">{p.badge}</span>
              </div>
              <Progress value={p.progress} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
