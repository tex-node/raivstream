'use client';

import { useParams } from 'next/navigation';
import { CastScreen } from '@/components/mobile-handoff/CastScreen';

export default function StoryPlaygroundCharactersPage() {
  const params = useParams();
  return <CastScreen projectId={String(params.projectId)} />;
}
