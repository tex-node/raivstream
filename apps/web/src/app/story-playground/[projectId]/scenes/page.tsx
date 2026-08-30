'use client';

import { useParams } from 'next/navigation';
import { ScenesScreen } from '@/components/mobile-handoff/ScenesScreen';

export default function StoryPlaygroundScenesPage() {
  const params = useParams();
  return <ScenesScreen projectId={String(params.projectId)} />;
}
