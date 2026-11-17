import { useState } from 'react'
import { Link } from 'react-router'
import { Play, Search } from 'lucide-react'
import { library, user } from '@/lib/data'
import { Avatar, ChipRow, Segmented, Still } from '@/components/ui'

const filters = ['All', 'Films', 'Scenes', 'Characters'] as const
type Filter = (typeof filters)[number]

export default function Library() {
  const [f, setF] = useState<Filter>('All')
  const [q, setQ] = useState('')
  const items = library.filter((x) => (f === 'All' || x.type === f) && x.title.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 hidden min-h-14 flex-wrap items-center gap-4 border-b border-hairline bg-window/90 px-5 py-2.5 backdrop-blur-xl md:flex">
        <span className="flex-1 basis-48 text-sm font-semibold">Library</span>
        <Segmented options={filters.map((v) => ({ value: v, label: v }))} value={f} onChange={setF} size="sm" className="w-[340px]" />
        <span className="flex flex-1 basis-48 justify-end text-xs text-label-2">{items.length} items</span>
      </header>

      <div className="px-4 pb-32 pt-[max(20px,env(safe-area-inset-top))] md:p-8">
        <div className="flex items-end justify-between px-1 md:hidden">
          <h1 className="text-[34px] font-bold tracking-[-.03em]">Library</h1>
          <Link to="/settings" aria-label="Account" className="mb-1"><Avatar initials={user.initials} /></Link>
        </div>
        <label className="mt-3.5 flex h-[38px] items-center gap-2 rounded-xl bg-surface px-3 md:hidden">
          <Search size={16} className="text-label-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scenes, characters, films" aria-label="Search library" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3" />
        </label>
        <ChipRow options={[...filters]} value={f} onChange={setF} className="-mx-4 mt-3.5 px-4 md:hidden" />

        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5 md:mt-0 md:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] md:gap-x-[18px] md:gap-y-[26px]">
          {items.map((it) => (
            <div key={it.title} className="flex flex-col gap-2">
              <Still cls={it.still} className={`rounded-2xl md:aspect-[16/11] md:h-auto md:rounded-[14px] ${it.duration ? 'h-[210px]' : 'h-[150px]'}`}>
                {it.duration && (
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-[3px] text-[11px] font-semibold backdrop-blur md:bottom-2.5 md:left-2.5">
                    <Play size={9} fill="currentColor" strokeWidth={0} />{it.duration}
                  </span>
                )}
              </Still>
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="-mt-1.5 text-xs text-label-2">{it.meta}</div>
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="py-16 text-center text-label-2">Nothing here yet.</p>}
      </div>
    </div>
  )
}
