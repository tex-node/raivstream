'use client';

import { useParams } from 'next/navigation';
import { StoryScreen } from '@/components/mobile-handoff/StoryScreen';

export default function StoryPlaygroundStoryPage() {
  const params = useParams();
  return <StoryScreen projectId={String(params.projectId)} />;
}
