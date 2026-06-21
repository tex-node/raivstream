'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const FUNNEL_LABELS: Record<string, string> = {
  story_playground_opened: 'Story Playground Opened',
  story_generated: 'Story Generated',
  scene_generation_completed: 'Scenes Generated',
  scene_image_completed: 'First Picture Generated',
  storybook_opened: 'Storybook Opened',
  storybook_completed: 'Storybook Completed',
};

type RecentAnalyticsEvent = {
  id: string;
  eventName: string;
  projectId: string | null;
  properties: unknown;
  createdAt: string | Date;
};

function eventLabel(eventName: string) {
  return eventName.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminStoryAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = trpc.admin.storyAnalytics.useQuery({ days });
  const maxFunnelUsers = Math.max(...(data?.funnel.map((stage) => stage.users) ?? [1]), 1);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Story Playground Analytics</h1>
          <p className="text-white/40 text-sm mt-1">Story completion funnel, image generation, and storybook behavior</p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="w-fit rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border px-6 py-5 text-red-300 text-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}>
          {error.message}
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ['Stories Created Today', data.cards.storiesCreatedToday],
              ['Stories Completed', data.cards.storiesCompleted],
              ['Pictures Generated', data.cards.picturesGenerated],
              ['Storybooks Opened', data.cards.storybooksOpened],
              ['Storybooks Completed', data.cards.storybooksCompleted],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border p-5" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/35">{label}</p>
                <p className="mt-3 text-3xl font-extrabold text-white">{(value as number).toLocaleString()}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border p-6" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="mb-5">
                <h2 className="text-white text-lg font-bold">Story Completion Funnel</h2>
                <p className="text-white/40 text-sm mt-1">Distinct users per stage in the selected period</p>
              </div>
              <div className="space-y-4">
                {data.funnel.map((stage) => {
                  const width = Math.max(6, Math.round((stage.users / maxFunnelUsers) * 100));
                  return (
                    <div key={stage.eventName}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-white/75">{FUNNEL_LABELS[stage.eventName] ?? eventLabel(stage.eventName)}</span>
                        <span className="font-mono text-white/45">{stage.users.toLocaleString()} users / {stage.events.toLocaleString()} events</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-violet-400" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border p-6" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <h2 className="text-white text-lg font-bold">Popular Signals</h2>
              <div className="mt-5 space-y-5">
                {[
                  ['Themes', data.popular.themes.length ? data.popular.themes : data.popular.inferredThemes],
                  ['Age Ranges', data.popular.ageRanges],
                  ['Characters', data.popular.characters],
                ].map(([label, items]) => (
                  <div key={label as string}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/35">{label as string}</p>
                    <div className="flex flex-wrap gap-2">
                      {(items as Array<{ label: string; count: number }>).length ? (items as Array<{ label: string; count: number }>).map((item) => (
                        <span key={`${label}-${item.label}`} className="rounded-full px-3 py-1 text-xs font-semibold text-violet-200" style={{ background: 'rgba(167,139,250,0.12)' }}>
                          {item.label} / {item.count}
                        </span>
                      )) : (
                        <span className="text-sm text-white/30">No data yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <h2 className="text-white text-lg font-bold">Recent Events</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th className="text-left px-5 py-3 text-white/40 font-medium">Event</th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium">Project</th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium">Properties</th>
                  <th className="text-right px-5 py-3 text-white/40 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((event: RecentAnalyticsEvent, index: number) => (
                  <tr key={event.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)', background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td className="px-5 py-3 font-semibold text-white/75">{eventLabel(event.eventName)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-white/45">{event.projectId ?? '-'}</td>
                    <td className="px-5 py-3 max-w-md">
                      <p className="truncate font-mono text-xs text-white/45">{JSON.stringify(event.properties ?? {})}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-white/40 text-xs">{new Date(event.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {data.recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-white/30">No story analytics events yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
