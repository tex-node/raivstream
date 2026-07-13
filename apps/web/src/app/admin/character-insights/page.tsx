'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function TopList({ title, items }: { title: string; items?: Array<{ name: string; count: number }> }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <div className="mt-4 space-y-2">
        {(items ?? []).length === 0 ? (
          <p className="text-sm font-semibold text-white/50">No data yet.</p>
        ) : (
          items?.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
              <span className="font-bold text-white/85">{item.name}</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-white/70">{item.count}</span>
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
    <div className="min-h-screen bg-[#050b18] p-4 text-white md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-violet-300">Story Playground</p>
          <h1 className="text-3xl font-black">Character Insights</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-white/60">
            Aggregated Character Director traits, goals, fears, relationships, and image-feedback outcomes.
          </p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 font-bold text-white outline-none"
        >
          <option value={7} className="bg-[#050b18]">Last 7 days</option>
          <option value={30} className="bg-[#050b18]">Last 30 days</option>
          <option value={90} className="bg-[#050b18]">Last 90 days</option>
          <option value={180} className="bg-[#050b18]">Last 180 days</option>
        </select>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4 font-bold text-red-200">{error.message}</div>}
      {isLoading && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center font-bold text-white/60">Loading character insights...</div>}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Characters" value={data.cards.totalCharacters} />
            <StatCard label="Avg Characters / Story" value={data.cards.averageCharactersPerStory.toFixed(1)} />
            <StatCard label="Avg Images / Character" value={data.cards.averageImagesPerCharacter.toFixed(1)} />
            <StatCard label="Relationships" value={data.cards.totalRelationships} />
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <TopList title="Common Personalities" items={data.popular.personalities} />
            <TopList title="Common Goals" items={data.popular.goals} />
            <TopList title="Common Fears" items={data.popular.fears} />
            <TopList title="Relationship Types" items={data.popular.relationshipTypes} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-black text-white">Successful Combinations</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-3 py-2">Personality</th>
                    <th className="px-3 py-2">Visual Style</th>
                    <th className="px-3 py-2">Characters</th>
                    <th className="px-3 py-2">Avg Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.successfulCombinations.map((item) => (
                    <tr key={`${item.personality}-${item.visualStyle}`} className="border-t border-white/10">
                      <td className="px-3 py-3 font-bold text-white">{item.personality}</td>
                      <td className="px-3 py-3 text-white/70">{item.visualStyle}</td>
                      <td className="px-3 py-3 text-white/70">{item.count}</td>
                      <td className="px-3 py-3 text-white/70">{item.averageRating === null ? 'No ratings' : item.averageRating.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-black text-white">Recent Characters</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.recentCharacters.map((character: RecentCharacterRow) => (
                <div key={character.id} className="rounded-xl bg-black/20 p-4">
                  <h3 className="font-black text-white">{character.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-white/45">{character.projectTitle}</p>
                  <p className="mt-3 text-sm font-bold text-white/70">{character.traits.join(', ') || 'No traits yet'}</p>
                  <p className="mt-2 text-xs text-white/50">
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
