'use client';

import { useParams } from 'next/navigation';
import { AssetsScreen } from '@/components/mobile-handoff/AssetsScreen';

export default function StoryPlaygroundAssetsPage() {
  const params = useParams();
  return <AssetsScreen projectId={String(params.projectId)} />;
}
