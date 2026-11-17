import { useState } from 'react'
import { user } from '@/lib/data'
import { cn } from '@/lib/cn'
import { Avatar, BackButton, Group, GroupLabel, GreyButton, LinkRow, Toggle } from '@/components/ui'

const prefs = [
  { key: 'notif', label: 'Notifications', hint: 'When a scene is ready' },
  { key: 'autoplay', label: 'Autoplay', hint: 'Play the next film in Watch' },
  { key: 'kidsLock', label: 'Kids lock', hint: 'Ask for a password to leave R16 Kids' },
] as const

export default function Settings() {
  const [state, setState] = useState({ notif: true, autoplay: true, kidsLock: false })

  return (
    <div className="mx-auto max-w-[640px] px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] md:px-0 md:py-14">
      <div className="md:hidden"><BackButton to="/create" /></div>

      <div className="mt-2 flex flex-col items-center text-center md:mt-0 md:flex-row md:flex-wrap md:gap-5 md:text-left">
        <Avatar initials={user.initials} size={88} className="md:size-[84px]!" />
        <div className="md:flex-1">
          <h1 className="mt-3 text-2xl font-bold tracking-tight md:mt-0 md:text-[28px]">{user.name}</h1>
          <div className="mt-0.5 text-sm text-label-2">{user.handle} · {user.role}<span className="hidden md:inline"> · {user.followers} followers</span></div>
        </div>
        <span className="hidden md:block"><GreyButton size="sm" className="h-8 font-medium">Edit profile</GreyButton></span>
        <div className="mt-3.5 flex gap-7 md:hidden">
          {[[user.followers, 'Followers'], [String(user.films), 'Films'], [user.views, 'Views']].map(([v, l]) => (
            <div key={l}><div className="text-[17px] font-bold">{v}</div><div className="text-xs text-label-2">{l}</div></div>
          ))}
        </div>
      </div>

      <Group className="mt-6 md:mt-[30px]">
        <LinkRow first to="/credits" label="Credits" value={user.credits.toLocaleString()} />
        <LinkRow to="/insights" label="Insights" />
      </Group>

      <GroupLabel>Preferences</GroupLabel>
      <Group>
        {prefs.map((p, i) => (
          <div key={p.key} className={cn('flex min-h-[58px] items-center justify-between gap-3 px-4 py-2 md:min-h-[54px]', i > 0 && 'hairline-top')}>
            <span className="flex flex-col">
              <span className="text-base md:text-sm">{p.label}</span>
              <span className="text-xs text-label-2">{p.hint}</span>
            </span>
            <Toggle label={p.label} on={state[p.key]} onChange={(v) => setState({ ...state, [p.key]: v })} />
          </div>
        ))}
      </Group>

      <GroupLabel>More</GroupLabel>
      <Group>
        <LinkRow first to="/kids" label="Open R16 Kids" />
        <LinkRow to="/admin" label="Admin console" />
        <LinkRow to="/" label="Sign out" danger />
      </Group>
    </div>
  )
}
