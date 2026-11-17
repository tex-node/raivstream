import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Clapperboard, Sparkles } from 'lucide-react'
import ProjectFrame from '@/components/ProjectFrame'
import { PrimaryButton, Progress } from '@/components/ui'
import { story } from '@/lib/data'
import { cn } from '@/lib/cn'

export default function Story() {
  const [sel, setSel] = useState<number | null>(1)
  const nav = useNavigate()
  const { id = 'dog' } = useParams()
  const toScenes = () => nav(`/project/${id}/scenes`)

  return (
    <ProjectFrame
      tab="story"
      subtitle="Saved"
      action={<PrimaryButton size="sm" onClick={toScenes}><Clapperboard size={15} /> Turn into scenes</PrimaryButton>}
      mobileAction={<PrimaryButton className="flex-1" onClick={toScenes}><Clapperboard size={18} /> Turn into scenes</PrimaryButton>}
    >
      <article className="mx-auto max-w-[680px] px-5 pb-6 pt-2 md:px-10 md:pb-20 md:pt-16">
        <div className="text-[13px] text-label-2">{story.chapter}</div>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-[1.12] tracking-[-.025em] md:mt-2 md:text-[40px] md:tracking-[-.03em]">{story.title}</h1>
        <div className="mt-3.5 flex max-w-[340px] items-center gap-3 md:mt-4">
          <Progress value={story.strength} className="h-1 flex-1" />
          <span className="text-xs text-label-2">Story strength {story.strength}%</span>
        </div>

        <p className="mt-6 text-[13px] text-label-3 md:mt-9">
          <span className="md:hidden">Tap</span><span className="hidden md:inline">Click</span> a paragraph to shape it.
        </p>
        <div className="-mx-3 mt-2 flex flex-col gap-1 md:-mx-4 md:gap-1.5">
          {story.paragraphs.map((text, i) => {
            const on = sel === i
            return (
              <div key={i}>
                <button
                  onClick={() => setSel(on ? null : i)}
                  aria-expanded={on}
                  className={cn('w-full rounded-2xl p-3 text-left text-[17px] leading-[1.62] transition-colors md:px-4 md:py-3.5 md:text-[19px] md:leading-[1.65]',
                    on ? 'bg-violet/15 text-label' : 'text-label/90 hover:bg-white/[.03]')}
                >
                  {text}
                </button>
                {on && (
                  // TODO: each chip dispatches the matching rewrite request for paragraph i.
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 pt-2 md:px-4 md:pt-1">
                    {story.actions.map((a, k) => (
                      <button
                        key={a}
                        className={cn('flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] md:h-8',
                          k === 0 ? 'bg-label font-semibold text-[#0a0a0c]' : 'border border-label/20 font-medium hover:bg-white/5',
                          k === 3 && 'hidden md:flex')}
                      >
                        {k === 0 && <Sparkles size={13} fill="currentColor" />}
                        {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </article>
    </ProjectFrame>
  )
}
