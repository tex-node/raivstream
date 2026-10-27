'use client';

/**
 * D-004 Phase 1 - admin organization list.
 *
 * Creation is inline rather than a modal: one form, one submit, and the slug is
 * derived from the name until the operator edits it (a slug is permanent, so the
 * derived value is a suggestion, not a lock).
 */

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

type OrgType = 'SCHOOL' | 'INSTITUTION' | 'PROGRAM';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function AdminOrganizationsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.listOrganizations.useQuery();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<OrgType>('SCHOOL');
  const [formError, setFormError] = useState<string | null>(null);

  const createOrg = trpc.admin.createOrganization.useMutation({
    onSuccess: async () => {
      setOpen(false);
      setName('');
      setSlug('');
      setSlugTouched(false);
      setType('SCHOOL');
      setFormError(null);
      await utils.admin.listOrganizations.invalidate();
    },
    onError: (err) => setFormError(err.message),
  });

  const orgs = data ?? [];

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[var(--noc-t1)]">Organizations</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">
            R16 training cohorts. Org staff see only their own students and work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white"
        >
          {open ? 'Cancel' : 'New organization'}
        </button>
      </div>

      {open && (
        <div className="mt-4 rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Name</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder="Test School"
                className="w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Slug</label>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="test-school"
                className="w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 font-mono text-sm text-[var(--noc-t1)] outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as OrgType)}
                className="rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)]"
              >
                <option value="SCHOOL">School</option>
                <option value="INSTITUTION">Institution</option>
                <option value="PROGRAM">Program</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!name.trim() || !slug.trim() || createOrg.isPending}
              onClick={() => createOrg.mutate({ name: name.trim(), slug: slug.trim(), type })}
              className="rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {createOrg.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
          {formError && <p className="mt-2 text-xs font-semibold text-[var(--noc-magenta)]">{formError}</p>}
        </div>
      )}

      {isLoading && <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading…</p>}
      {error && <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>}

      {!isLoading && !error && orgs.length === 0 && (
        <div className="mt-8 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--noc-t3)]">No organizations yet.</p>
          <p className="mt-1 text-xs text-[var(--noc-t5)]">Create one, then add members by email.</p>
        </div>
      )}

      {orgs.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Videos</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-[var(--noc-hairline)] hover:bg-[rgba(217,70,168,0.06)]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/organizations/${org.id}`} className="font-bold text-[var(--noc-t1)]">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--noc-t5)]">{org.slug}</td>
                  <td className="px-4 py-3 text-[var(--noc-t4)]">{org.type.toLowerCase()}</td>
                  <td className="px-4 py-3 text-[var(--noc-t3)]">{org.studentCount}</td>
                  <td className="px-4 py-3 text-[var(--noc-t3)]">{org.videoCount}</td>
                  <td className="px-4 py-3 text-[var(--noc-t4)]">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
