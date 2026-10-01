import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { verifyAccessToken } from '@raivstream/api/src/lib/jwt';
import { getCookieValue, COOKIE_NAMES } from '@/lib/cookies';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  // Auth — httpOnly cookie is sent automatically on link/anchor navigation
  const token = getCookieValue(req, COOKIE_NAMES.access);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { exportId } = await params;

  // Ownership: StoryVideoExport.userId is a direct field — no project join needed
  const exportRecord = await prisma.storyVideoExport.findFirst({
    where: { id: exportId, userId },
    select: { status: true, assetUrl: true },
  });

  if (!exportRecord) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (exportRecord.status !== 'READY' || !exportRecord.assetUrl) {
    return NextResponse.json({ error: 'Export not ready' }, { status: 404 });
  }

  // Fetch from the stored R2 CDN URL server-side — never accept a URL from the client
  const upstream = await fetch(exportRecord.assetUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to fetch export' }, { status: 502 });
  }

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Content-Disposition': 'attachment; filename="my-story.mp4"',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);

  return new NextResponse(upstream.body, { status: 200, headers });
}
