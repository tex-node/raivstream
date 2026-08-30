'use client';

import { useParams } from 'next/navigation';
import { CharacterDetailScreen } from '@/components/mobile-handoff/CharacterDetailScreen';

export default function StoryPlaygroundCharacterDetailPage() {
  const params = useParams();
  return <CharacterDetailScreen projectId={String(params.projectId)} characterId={String(params.characterId)} />;
}
