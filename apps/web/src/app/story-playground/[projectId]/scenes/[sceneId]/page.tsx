'use client';

import { useParams } from 'next/navigation';
import { SceneDirectorScreen } from '@/components/mobile-handoff/SceneDirectorScreen';

export default function StoryPlaygroundSceneDirectorPage() {
  const params = useParams();
  return <SceneDirectorScreen projectId={String(params.projectId)} sceneId={String(params.sceneId)} />;
}
