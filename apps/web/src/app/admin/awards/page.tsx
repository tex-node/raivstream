'use client';

/**
 * D-004 Phase 2 - admin awards dashboard.
 *
 * Two jobs in one page: shortlist review across every organization, and the
 * category list those nominations point at.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type Tab = 'nominations' | 'categories';
type Status = 'PENDING' | 'SHORTLISTED' | 'WINNER' | 'REJECTED';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  SHORTLISTED: 'bg-[rgba(59,130,246,0.15)] text-[#60a5fa]',
  WINNER: 'bg-[rgba(16,185,129,0.2)] text-[#34d399]',
  REJECTED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
};

const FILTERS: ('ALL' | Status)[] = ['ALL', 'PENDING', 'SHORTLISTED', 'WINNER', 'REJECTED'];

export default function AdminAwardsPage() {
  const [tab, setTab] = useState<Tab>('nominations');

  return (
    <main className="p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[var(--noc-t1)]">Awards</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">
            Cross-organization shortlist. Org staff nominate; Raivstream picks the winners.
          </p>
        </div>
        <div className="flex gap-2">
          {(['nominations', 'categories'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${
                tab === value
                  ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
                  : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      {tab === 'nominations' ? <Nominations /> : <Categories />}
    </main>
  );
}

function Nominations() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<'ALL' | Status>('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [orgId, setOrgId] = useState('');

  const categories = trpc.admin.listAwardCategories.useQuery();
  const orgs = trpc.admin.listOrganizations.useQuery();

  const { data, isLoading, error } = trpc.admin.listAllNominations.useQuery({
    ...(status === 'ALL' ? {} : { status }),
    ...(categoryId ? { categoryId } : {}),
    ...(orgId ? { orgId } : {}),
  });

  const update = trpc.admin.updateNominationStatus.useMutation({
    onSuccess: async () => { await utils.admin.listAllNominations.invalidate(); },
  });

  const rows = data ?? [];

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'ALL' | Status)}
          className="rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-1.5 text-xs text-[var(--noc-t2)]"
        >
          {FILTERS.map((value) => (
            <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : value.toLowerCase()}</option>
          ))}
        </select>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-1.5 text-xs text-[var(--noc-t2)]"
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-1.5 text-xs text-[var(--noc-t2)]"
        >
          <option value="">All organizations</option>
          {(orgs.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <span className="text-xs text-[var(--noc-t5)]">{rows.length} nomination{rows.length === 1 ? '' : 's'}</span>
      </div>

      {isLoading && <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading…</p>}
      {error && <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>}

      {!isLoading && !error && rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--noc-t3)]">No nominations yet.</p>
          <p className="mt-1 text-xs text-[var(--noc-t5)]">
            Org admins and moderators nominate from their organization dashboard.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Org</th>
                <th className="px-3 py-3">Nominated by</th>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--noc-hairline)]">
                  <td className="px-3 py-3 text-xs text-[var(--noc-t4)]">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-[var(--noc-t3)]">{row.organization.name}</td>
                  <td className="px-3 py-3 text-xs text-[var(--noc-t4)]">{row.nominatedBy.email}</td>
                  <td className="px-3 py-3">
                    <span className="block text-[var(--noc-t1)]">{row.title}</span>
                    <span className="block text-[10px] uppercase tracking-wide text-[var(--noc-t6)]">
                      {row.targetType.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[var(--noc-t3)]">{row.categoryName}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[row.status] ?? ''}`}>
                      {row.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={row.status}
                      onChange={(e) => update.mutate({ nominationId: row.id, status: e.target.value as Status })}
                      className="rounded-md border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-2 py-1 text-[11px] text-[var(--noc-t2)]"
                    >
                      {(['PENDING', 'SHORTLISTED', 'WINNER', 'REJECTED'] as Status[]).map((value) => (
                        <option key={value} value={value}>{value.toLowerCase()}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Categories() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.listAwardCategories.useQuery();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const create = trpc.admin.createAwardCategory.useMutation({
    onSuccess: async () => {
      setName('');
      setDescription('');
      setFormError(null);
      await utils.admin.listAwardCategories.invalidate();
    },
    onError: (err) => setFormError(err.message),
  });

  const categories = data ?? [];

  return (
    <>
      <div className="mt-5 rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--noc-t4)]">Add category</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Best Story"
              className="w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
            />
          </div>
          <div className="min-w-[240px] flex-[2]">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Awarded for the strongest narrative arc"
              className="w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate({ name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) })}
            className="rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {create.isPending ? 'Adding…' : 'Add category'}
          </button>
        </div>
        {formError && <p className="mt-2 text-xs font-semibold text-[var(--noc-magenta)]">{formError}</p>}
      </div>

      {isLoading && <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading…</p>}
      {error && <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>}

      {!isLoading && !error && categories.length === 0 && (
        <p className="mt-6 text-xs text-[var(--noc-t5)]">
          No categories yet. Org staff cannot nominate until at least one exists.
        </p>
      )}

      {categories.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-[var(--noc-hairline)]">
                  <td className="px-4 py-3 font-bold text-[var(--noc-t1)]">{category.name}</td>
                  <td className="px-4 py-3 text-[var(--noc-t4)]">{category.description ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--noc-t4)]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      category.isActive ? STATUS_STYLES.WINNER : STATUS_STYLES.REJECTED
                    }`}>
                      {category.isActive ? 'active' : 'closed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
