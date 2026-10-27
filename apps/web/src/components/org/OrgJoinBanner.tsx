'use client';

/**
 * D-004 - "are you part of a school program?" banner.
 *
 * Only for signed-in users with no active membership: a student who has already
 * joined does not need to be asked again, and a guest has no account to attach a
 * membership to. Dismissal is per-browser and permanent - nagging is worse than
 * a missed join.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

const DISMISS_KEY = 'rv_org_banner_dismissed';

export function OrgJoinBanner() {
  const { isSignedIn, isLoaded } = useUser();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const memberships = trpc.organization.myOrganizations.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
  });

  if (!isLoaded || !isSignedIn || dismissed) return null;
  if (memberships.isLoading || memberships.error) return null;
  if ((memberships.data?.length ?? 0) > 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--noc-hairline)] bg-[rgba(217,70,168,0.12)] px-4 py-2">
      <p className="text-xs text-[var(--noc-t2)]">
        Are you part of a school program?{' '}
        <Link href="/join" className="font-bold underline">
          Join with code
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* storage unavailable - dismiss for this session only */
          }
        }}
        className="text-xs text-[var(--noc-t6)]"
      >
        ✕
      </button>
    </div>
  );
}
