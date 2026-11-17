import { NavLink, Outlet, useLocation, Link } from 'react-router'
import { BarChart3, LayoutGrid, Play, Plus, Smile } from 'lucide-react'
import { cn } from '@/lib/cn'
import { projects, user } from '@/lib/data'
import { Avatar, Logo } from './ui'

const nav = [
  { to: '/watch', label: 'Watch', icon: Play },
  { to: '/create', label: 'Create', icon: Plus },
  { to: '/kids', label: 'R16 Kids', icon: Smile },
  { to: '/library', label: 'Library', icon: LayoutGrid },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
]

function Sidebar() {
  const { pathname } = useLocation()
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col gap-1 border-r border-hairline bg-sidebar px-3 py-5 md:flex">
      <Logo className="mx-2 mb-5 self-start" />
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn('flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] font-medium transition-colors',
              isActive ? 'bg-white/10 text-label' : 'text-label/80 hover:bg-white/5')
          }
        >
          <Icon size={16} strokeWidth={2} />
          {label}
        </NavLink>
      ))}

      <div className="px-2.5 pb-1.5 pt-5 text-[11px] font-semibold text-label-3">Projects</div>
      {projects.map((p) => {
        const active = pathname.startsWith(`/project/${p.id}`)
        return (
          <Link key={p.id} to={`/project/${p.id}/story`} className={cn('flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] transition-colors', active ? 'bg-white/10 font-medium' : 'text-label/85 hover:bg-white/5')}>
            <span className={cn(p.still, 'size-4 rounded')} />
            <span className="truncate">{p.title}</span>
          </Link>
        )
      })}

      <div className="flex-1" />
      <NavLink to="/settings" className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg border-t border-hairline p-2.5', isActive && 'bg-white/10')}>
        <Avatar initials={user.initials} size={28} />
        <span className="flex flex-col">
          <span className="text-[13px] font-medium">{user.name}</span>
          <span className="text-[11px] text-label-2">{user.credits.toLocaleString()} credits</span>
        </span>
      </NavLink>
    </aside>
  )
}

const pillRoutes = ['/watch', '/create', '/library']

function TabPill() {
  const { pathname } = useLocation()
  if (!pillRoutes.includes(pathname)) return null
  const items = [
    { to: '/watch', label: 'Watch', icon: <Play size={22} fill="currentColor" strokeWidth={0} /> },
    { to: '/create', label: 'Create', icon: <Plus size={22} strokeWidth={2} /> },
    { to: '/library', label: 'Library', icon: <LayoutGrid size={22} strokeWidth={1.9} /> },
  ]
  return (
    <nav aria-label="Main" className="glass fixed bottom-7 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5 md:hidden">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          aria-label={i.label}
          className={({ isActive }) => cn('flex h-[46px] w-[52px] items-center justify-center rounded-full transition-colors', isActive ? 'bg-white/[.14] text-label' : 'text-label-2')}
        >
          {i.icon}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Shell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-ink">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto bg-ink md:bg-window">
        <Outlet />
      </main>
      <TabPill />
    </div>
  )
}
