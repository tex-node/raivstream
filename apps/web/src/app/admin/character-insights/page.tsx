'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard } from '../AdminShell';

function TopList({ title, items }: { title: string; items?: Array<{ name: string; count: number }> }) {
  return (
    <section className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
      <h2 className="text-lg font-black text-[var(--noc-t1)]">{title}</h2>
      <div className="mt-4 space-y-2">
        {(items ?? []).length === 0 ? (
          <p className="text-sm font-semibold text-[var(--noc-t4)]">No data yet.</p>
        ) : (
          items?.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2">
              <span className="font-bold text-[var(--noc-t2)]">{item.name}</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-[var(--noc-t3)]">{item.count}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type RecentCharacterRow = {
  id: string;
  name: string;
  projectTitle: string;
  traits: string[];
  goal: string | null;
  fear: string | null;
  walkingStyle: string | null;
};

export default function CharacterInsightsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = trpc.admin.characterInsights.useQuery({ days, limit: 120 });

  return (
    <div className="p-4 text-[var(--noc-t1)] md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-purple)]">Story Playground</p>
          <h1 className="text-3xl font-black text-[var(--noc-t1)]">Character Insights</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--noc-t4)]">
            Aggregated Character Director traits, goals, fears, relationships, and image-feedback outcomes.
          </p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-3 font-bold text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value={7}   className="bg-[#0B0D14]">Last 7 days</option>
          <option value={30}  className="bg-[#0B0D14]">Last 30 days</option>
          <option value={90}  className="bg-[#0B0D14]">Last 90 days</option>
          <option value={180} className="bg-[#0B0D14]">Last 180 days</option>
        </select>
      </div>

      {error && <AdminError message={error.message} />}
      {isLoading && <AdminSpinner />}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <AdminStatCard label="Characters"              value={data.cards.totalCharacters} />
            <AdminStatCard label="Avg Characters / Story"  value={data.cards.averageCharactersPerStory.toFixed(1)} />
            <AdminStatCard label="Avg Images / Character"  value={data.cards.averageImagesPerCharacter.toFixed(1)} />
            <AdminStatCard label="Relationships"           value={data.cards.totalRelationships} />
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <TopList title="Common Personalities" items={data.popular.personalities} />
            <TopList title="Common Goals"         items={data.popular.goals} />
            <TopList title="Common Fears"         items={data.popular.fears} />
            <TopList title="Relationship Types"   items={data.popular.relationshipTypes} />
          </div>

          <section className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
            <h2 className="text-lg font-black text-[var(--noc-t1)]">Successful Combinations</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[var(--noc-t4)]">
                  <tr>
                    <th className="px-3 py-2">Personality</th>
                    <th className="px-3 py-2">Visual Style</th>
                    <th className="px-3 py-2">Characters</th>
                    <th className="px-3 py-2">Avg Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.successfulCombinations.map((item) => (
                    <tr key={`${item.personality}-${item.visualStyle}`} className="border-t border-[var(--noc-hairline)]">
                      <td className="px-3 py-3 font-bold text-[var(--noc-t1)]">{item.personality}</td>
                      <td className="px-3 py-3 text-[var(--noc-t3)]">{item.visualStyle}</td>
                      <td className="px-3 py-3 text-[var(--noc-t3)]">{item.count}</td>
                      <td className="px-3 py-3 text-[var(--noc-t3)]">{item.averageRating === null ? 'No ratings' : item.averageRating.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
            <h2 className="text-lg font-black text-[var(--noc-t1)]">Recent Characters</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.recentCharacters.map((character: RecentCharacterRow) => (
                <div key={character.id} className="rounded-xl bg-white/[0.05] p-4">
                  <h3 className="font-black text-[var(--noc-t1)]">{character.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--noc-t4)]">{character.projectTitle}</p>
                  <p className="mt-3 text-sm font-bold text-[var(--noc-t3)]">{character.traits.join(', ') || 'No traits yet'}</p>
                  <p className="mt-2 text-xs text-[var(--noc-t4)]">
                    Goal: {character.goal ?? 'None'} | Fear: {character.fear ?? 'None'} | Walk: {character.walkingStyle ?? 'None'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
