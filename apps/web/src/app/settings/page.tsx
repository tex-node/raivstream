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
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
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
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto pt-24 px-4 pb-20">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-8 gap-6">
          {(['profile', 'account', 'billing'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-white border-pink-500'
                  : 'text-white/40 border-transparent hover:text-white/70'
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
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 flex-shrink-0">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-pink-500 flex items-center justify-center text-2xl font-bold">
                    {displayName?.[0] ?? '?'}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{profile?.username}</p>
                <p className="text-white/40 text-xs mt-0.5">
                  @{profile?.username}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-1.5">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your display name"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-1.5">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Tell the world about yourself…"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors resize-none"
              />
              <p className="text-white/30 text-xs mt-1 text-right">{bio.length}/160</p>
            </div>

            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {updateProfile.isPending ? 'Saving…' : saved ? '✓ Saved!' : 'Save changes'}
            </button>
          </form>
        )}

        {/* Account tab */}
        {activeTab === 'account' && (
          <div className="flex flex-col gap-6">
            {/* Current plan */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <p className="text-white/50 text-xs uppercase tracking-widest mb-1">Current plan</p>
              <p className="text-xl font-bold">
                {tierLabel[profile?.premiumTier ?? 'FREE'] ?? 'Free'}
              </p>
              {profile?.premiumUntil && (
                <p className="text-white/40 text-xs mt-1">
                  Renews {new Date(profile.premiumUntil).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Creator mode */}
            {profile?.role !== 'CREATOR' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="font-semibold mb-1">Become a creator</h3>
                <p className="text-white/50 text-sm mb-4">
                  Switch to a creator account to upload videos and access analytics.
                </p>
                <button
                  onClick={() => becomeCreator.mutate()}
                  disabled={becomeCreator.isPending}
                  className="bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
                >
                  {becomeCreator.isPending ? 'Switching…' : 'Switch to creator'}
                </button>
              </div>
            )}

            {/* Upgrade prompt */}
            {profile?.premiumTier === 'FREE' && (
              <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-2xl p-5">
                <h3 className="font-semibold mb-1">Upgrade your plan</h3>
                <p className="text-white/60 text-sm mb-4">
                  Go ad-free and unlock premium features from $4.99/month.
                </p>
                <a
                  href="/pricing"
                  className="inline-block bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
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
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-1">Manage subscription</h3>
              <p className="text-white/50 text-sm mb-4">
                Update payment method, view invoices, or cancel your subscription.
              </p>
              {profile?.premiumTier !== 'FREE' ? (
                <button
                  onClick={handleBillingPortal}
                  disabled={portalLoading}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors disabled:opacity-50"
                >
                  {portalLoading ? 'Opening…' : 'Open billing portal'}
                </button>
              ) : (
                <a
                  href="/pricing"
                  className="inline-block bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
                >
                  Subscribe to a plan
                </a>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-1">Revenue sharing</h3>
              <p className="text-white/50 text-sm">
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
