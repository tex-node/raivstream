'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';
import { StudioHeader } from '@/components/creative/studio/StudioHeader';
import { NewCampaignPanel } from '@/components/creative/studio/NewCampaignPanel';
import { CampaignList } from '@/components/creative/studio/CampaignList';
import { ProductList } from '@/components/creative/studio/ProductList';

export default function StudioPage() {
  const params = useParams<{ studioId: string }>();
  const { isLoaded, isSignedIn } = useUser();
  const studioId = params.studioId;

  const studioQuery = trpc.creative.studio.get.useQuery({ studioId }, { enabled: Boolean(isLoaded && isSignedIn && studioId) });
  const productsQuery = trpc.creative.studio.product.list.useQuery({ studioId }, { enabled: Boolean(isLoaded && isSignedIn && studioId) });
  const campaignsQuery = trpc.creative.studio.campaign.list.useQuery({ studioId }, { enabled: Boolean(isLoaded && isSignedIn && studioId) });
  const contextQuery = trpc.creative.studio.context.get.useQuery({ studioId }, { enabled: Boolean(isLoaded && isSignedIn && studioId) });

  if (studioQuery.isLoading) return <div className="flex min-h-screen items-center justify-center bg-[var(--noc-page)] text-[var(--noc-t4)]">Loading studio…</div>;
  if (studioQuery.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--noc-page)] text-[var(--noc-t4)]">
        <p className="font-bold text-[#e35d5d]">{studioQuery.error.message}</p>
        <a href="/create" className="text-sm font-semibold text-[var(--noc-purple)]">← Start a new project</a>
      </div>
    );
  }

  const studio = studioQuery.data as any;
  const products = (productsQuery.data ?? []) as any[];
  const campaigns = (campaignsQuery.data ?? []) as any[];

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <StudioHeader studio={studio} />
        <section className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Products</p>
          <ProductList products={products} />
        </section>
        <NewCampaignPanel studioId={studioId} products={products} />
        <section className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Campaigns</p>
          <CampaignList studioId={studioId} campaigns={campaigns} products={products} />
        </section>
        {contextQuery.data && (
          <p className="text-xs text-[var(--noc-t6)]">
            Context ready: {contextQuery.data.reusableAssets.length} reusable asset(s), {contextQuery.data.campaign ? `campaign "${contextQuery.data.campaign.name}"` : 'no campaign selected'}.
          </p>
        )}
      </div>
    </div>
  );
}