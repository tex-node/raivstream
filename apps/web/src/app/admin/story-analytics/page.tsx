'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError } from '../AdminShell';

const FUNNEL_LABELS: Record<string, string> = {
  story_playground_opened:    'Story Playground Opened',
  story_generated:            'Story Generated',
  scene_generation_completed: 'Scenes Generated',
  scene_image_completed:      'First Picture Generated',
  storybook_opened:           'Storybook Opened',
  storybook_completed:        'Storybook Completed',
};

type RecentAnalyticsEvent = {
  id: string;
  eventName: string;
  projectId: string | null;
  properties: unknown;
  createdAt: string | Date;
};

function eventLabel(eventName: string) {
  return eventName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function AdminStoryAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = trpc.admin.storyAnalytics.useQuery({ days });
  const maxFunnelUsers = Math.max(...(data?.funnel.map((stage) => stage.users) ?? [1]), 1);

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Story Playground Analytics</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">Story completion funnel, image generation, and storybook behavior</p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-3 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value={7}   className="bg-[#0B0D14]">Last 7 days</option>
          <option value={30}  className="bg-[#0B0D14]">Last 30 days</option>
          <option value={90}  className="bg-[#0B0D14]">Last 90 days</option>
          <option value={180} className="bg-[#0B0D14]">Last 180 days</option>
        </select>
      </div>

      {isLoading && <AdminSpinner />}
      {error && <AdminError message={error.message} />}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {([
              ['Stories Created Today', data.cards.storiesCreatedToday],
              ['Stories Completed',     data.cards.storiesCompleted],
              ['Pictures Generated',    data.cards.picturesGenerated],
              ['Storybooks Opened',     data.cards.storybooksOpened],
              ['Storybooks Completed',  data.cards.storybooksCompleted],
            ] as [string, number][]).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--noc-t4)]">{label}</p>
                <p className="mt-3 text-3xl font-extrabold text-[var(--noc-t1)]">{value.toLocaleString()}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-[var(--noc-hairline)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-[var(--noc-t1)]">Story Completion Funnel</h2>
                <p className="mt-1 text-sm text-[var(--noc-t4)]">Distinct users per stage in the selected period</p>
              </div>
              <div className="space-y-4">
                {data.funnel.map((stage) => {
                  const width = Math.max(6, Math.round((stage.users / maxFunnelUsers) * 100));
                  return (
                    <div key={stage.eventName}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-[var(--noc-t3)]">{FUNNEL_LABELS[stage.eventName] ?? eventLabel(stage.eventName)}</span>
                        <span className="font-mono text-[var(--noc-t5)]">{stage.users.toLocaleString()} users / {stage.events.toLocaleString()} events</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full bg-[var(--noc-blue)]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--noc-hairline)] p-6">
              <h2 className="text-lg font-bold text-[var(--noc-t1)]">Popular Signals</h2>
              <div className="mt-5 space-y-5">
                {([
                  ['Themes',     data.popular.themes.length ? data.popular.themes : data.popular.inferredThemes],
                  ['Age Ranges', data.popular.ageRanges],
                  ['Characters', data.popular.characters],
                ] as [string, Array<{ label: string; count: number }>][]).map(([label, items]) => (
                  <div key={label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--noc-t4)]">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.length ? items.map((item) => (
                        <span
                          key={`${label}-${item.label}`}
                          className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--noc-purple)]"
                          style={{ background: 'rgba(178,90,217,0.12)' }}
                        >
                          {item.label} / {item.count}
                        </span>
                      )) : (
                        <span className="text-sm text-[var(--noc-t5)]">No data yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
            <div className="border-b border-[var(--noc-hairline)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--noc-t1)]">Recent Events</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                  <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Event</th>
                  <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Project</th>
                  <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Properties</th>
                  <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((event: RecentAnalyticsEvent, index: number) => (
                  <tr key={event.id} className={`border-t border-[var(--noc-hairline)] ${index % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="px-5 py-3 font-semibold text-[var(--noc-t2)]">{eventLabel(event.eventName)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--noc-t5)]">{event.projectId ?? '-'}</td>
                    <td className="max-w-md px-5 py-3">
                      <p className="truncate font-mono text-xs text-[var(--noc-t5)]">{JSON.stringify(event.properties ?? {})}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-[var(--noc-t4)]">{new Date(event.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {data.recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-[var(--noc-t5)]">No story analytics events yet</td>
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
