import { type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import { projects } from '@/lib/data'
import { cn } from '@/lib/cn'
import { BackButton, CircleButton, Segmented } from './ui'

type Tab = 'story' | 'cast' | 'scenes'

/**
 * Shared frame for the three project screens.
 * Mobile: back · title · more, segmented switch under it, primary action pinned to the bottom.
 * Desktop: one toolbar — title left, segmented centre, primary action right.
 */
export default function ProjectFrame({
  tab, subtitle, action, mobileAction, children, fill,
}: {
  tab: Tab
  subtitle: string
  action?: ReactNode
  mobileAction?: ReactNode
  children: ReactNode
  /** Desktop body fills the window height (for side-panel layouts) instead of scrolling as a page. */
  fill?: boolean
}) {
  const { id = 'dog' } = useParams()
  const nav = useNavigate()
  const project = projects.find((p) => p.id === id) ?? projects[0]
  const tabs = [
    { value: 'story' as Tab, label: 'Story' },
    { value: 'cast' as Tab, label: 'Cast' },
    { value: 'scenes' as Tab, label: 'Scenes' },
  ]
  const go = (t: Tab) => nav(`/project/${project.id}/${t}`)
  // mobileAction === null hides the bottom bar; undefined falls back to the desktop action.
  const bottom = mobileAction !== undefined ? mobileAction : action

  return (
    <div className={cn('flex min-h-full flex-col', fill && 'md:h-full')}>
      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex flex-col gap-3.5 bg-gradient-to-b from-ink from-70% to-transparent px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <BackButton to="/create" />
          <span className="truncate text-base font-semibold tracking-tight">{project.title}</span>
          <CircleButton label="More"><MoreHorizontal size={18} /></CircleButton>
        </div>
        <Segmented options={tabs} value={tab} onChange={go} />
      </header>

      {/* Desktop toolbar */}
      <header className="sticky top-0 z-20 hidden min-h-14 flex-wrap items-center gap-4 border-b border-hairline bg-window/90 px-5 py-2.5 backdrop-blur-xl md:flex">
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="truncate text-sm font-semibold">{project.title}</span>
          <span className="text-[11px] text-label-2">{subtitle}</span>
        </div>
        <Segmented options={tabs} value={tab} onChange={go} size="sm" className="w-[270px]" />
        <div className="flex flex-1 basis-48 justify-end gap-2">{action}</div>
      </header>

      <div className={cn('flex-1', fill && 'md:min-h-0')}>{children}</div>

      {bottom && (
        <div className="sticky bottom-0 z-20 flex gap-2.5 bg-gradient-to-b from-transparent to-ink to-35% px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 md:hidden">
          {bottom}
        </div>
      )}
    </div>
  )
}
