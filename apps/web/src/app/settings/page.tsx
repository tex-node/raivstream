'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

type Tab = 'profile' | 'account' | 'billing';

export default function SettingsPage() {
  const { isSignedIn, user } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const profileQuery = trpc.user.getProfile.useQuery(undefined, {
    enabled: !!isSignedIn,
  });

  // Populate form fields when profile data loads (react-query v5 uses useEffect instead of onSuccess)
  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? '');
      setBio(profileQuery.data.bio ?? '');
    }
  }, [profileQuery.data]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      profileQuery.refetch();
    },
  });

  const becomeCreator = trpc.user.becomeCreator.useMutation({
    onSuccess: () => profileQuery.refetch(),
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      displayName: displayName || undefined,
      bio: bio || undefined,
    });
  };

  const handleBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/billing-portal', { method: 'POST' });
      const { url, error } = await res.json();
      if (url) router.push(url);
      else alert(error ?? 'Could not open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
        <p>Please sign in to access settings.</p>
      </div>
    );
  }

  const profile = profileQuery.data;
  const tierLabel: Record<string, string> = {
    FREE: 'Free',
    VIEWER_PREMIUM: 'Viewer Premium',
    CREATOR_PREMIUM: 'Creator Premium',
    ULTIMATE: 'Ultimate',
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
      <Navbar />
      <div className="max-w-2xl mx-auto pt-24 px-4 pb-20">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Tabs */}
        <div className="flex mb-8 gap-6" style={{ borderBottom: '1px solid var(--noc-hairline)' }}>
          {(['profile', 'account', 'billing'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-[var(--noc-t1)] border-[#d946a8]'
                  : 'text-[var(--noc-t6)] border-transparent hover:text-[var(--noc-t3)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
            {/* Avatar preview */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ border: '2px solid var(--noc-hairline)' }}>
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold" style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}>
                    {displayName?.[0] ?? '?'}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{profile?.username}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--noc-t6)' }}>
                  @{profile?.username}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--noc-t5)' }}>Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your display name"
                className="w-full rounded-xl px-4 py-2.5 outline-none transition-colors"
                style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(217,70,168,0.6)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(233,233,237,0.08)')}
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--noc-t5)' }}>Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Tell the world about yourself…"
                className="w-full rounded-xl px-4 py-2.5 outline-none transition-colors resize-none"
                style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(217,70,168,0.6)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(233,233,237,0.08)')}
              />
              <p className="text-xs mt-1 text-right" style={{ color: 'var(--noc-t6)' }}>{bio.length}/160</p>
            </div>

            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="w-full font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 hover:opacity-90"
              style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
            >
              {updateProfile.isPending ? 'Saving…' : saved ? '✓ Saved!' : 'Save changes'}
            </button>
          </form>
        )}

        {/* Account tab */}
        {activeTab === 'account' && (
          <div className="flex flex-col gap-6">
            {/* Current plan */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)' }}>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--noc-t6)' }}>Current plan</p>
              <p className="text-xl font-bold">
                {tierLabel[profile?.premiumTier ?? 'FREE'] ?? 'Free'}
              </p>
              {profile?.premiumUntil && (
                <p className="text-xs mt-1" style={{ color: 'var(--noc-t6)' }}>
                  Renews {new Date(profile.premiumUntil).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Creator mode — role-upgrade surface ("applications" per the
                Phase 2 acceptance boundary; there is no separate route for
                this today, it lives here) */}
            {profile?.role !== 'CREATOR' && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)' }}>
                <h3 className="font-semibold mb-1">Become a creator</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--noc-t6)' }}>
                  Switch to a creator account to upload videos and access analytics.
                </p>
                <button
                  onClick={() => becomeCreator.mutate()}
                  disabled={becomeCreator.isPending}
                  className="text-sm font-semibold px-5 py-2 rounded-full transition-colors disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
                >
                  {becomeCreator.isPending ? 'Switching…' : 'Switch to creator'}
                </button>
              </div>
            )}

            {/* Upgrade prompt */}
            {profile?.premiumTier === 'FREE' && (
              <div className="rounded-2xl p-5" style={{ background: 'rgba(178,90,217,0.10)', border: '1px solid rgba(178,90,217,0.25)' }}>
                <h3 className="font-semibold mb-1">Upgrade your plan</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--noc-t4)' }}>
                  Go ad-free and unlock premium features from $4.99/month.
                </p>
                <a
                  href="/pricing"
                  className="inline-block text-sm font-semibold px-5 py-2 rounded-full transition-colors hover:opacity-90"
                  style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
                >
                  View plans
                </a>
              </div>
            )}
          </div>
        )}

        {/* Billing tab */}
        {activeTab === 'billing' && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl p-5" style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)' }}>
              <h3 className="font-semibold mb-1">Manage subscription</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--noc-t6)' }}>
                Update payment method, view invoices, or cancel your subscription.
              </p>
              {profile?.premiumTier !== 'FREE' ? (
                <button
                  onClick={handleBillingPortal}
                  disabled={portalLoading}
                  className="text-sm font-semibold px-5 py-2 rounded-full transition-colors disabled:opacity-50"
                  style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }}
                >
                  {portalLoading ? 'Opening…' : 'Open billing portal'}
                </button>
              ) : (
                <a
                  href="/pricing"
                  className="inline-block text-sm font-semibold px-5 py-2 rounded-full transition-colors hover:opacity-90"
                  style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
                >
                  Subscribe to a plan
                </a>
              )}
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)' }}>
              <h3 className="font-semibold mb-1">Revenue sharing</h3>
              <p className="text-sm" style={{ color: 'var(--noc-t6)' }}>
                Creator Premium and Ultimate plans include 70/30 revenue sharing. Earnings are
                calculated monthly and paid via Stripe Connect.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
