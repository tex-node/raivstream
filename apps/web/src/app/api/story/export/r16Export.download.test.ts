/**
 * T1–T5: R16 story export download route tests.
 *
 * Tests the GET /api/story/export/[exportId]/download handler for:
 * T1 — unauthenticated request rejected
 * T2 — authenticated wrong-user request rejected
 * T3 — authenticated non-READY export rejected
 * T4 — authorized READY export returns 200
 * T5 — successful response has correct headers and non-empty body
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@raivstream/database', () => ({
  prisma: {
    storyVideoExport: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@raivstream/api/src/lib/jwt', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('@/lib/cookies', () => ({
  getCookieValue: vi.fn(),
  COOKIE_NAMES: { access: 'raiv_at' },
}));

import { GET } from './[exportId]/download/route';
import { prisma } from '@raivstream/database';
import { verifyAccessToken } from '@raivstream/api/src/lib/jwt';
import { getCookieValue } from '@/lib/cookies';

const mockFindFirst = vi.mocked(prisma.storyVideoExport.findFirst);
const mockVerify    = vi.mocked(verifyAccessToken);
const mockGetCookie = vi.mocked(getCookieValue);

const ASSET_URL  = 'https://media.raivstream.com/story-exports/p1/exports/e1/out.mp4';
const READY_ROW  = { status: 'READY', assetUrl: ASSET_URL };
const EXPORT_ID  = 'exp-test-1';

function makeReq(): Request {
  return new Request(`http://localhost/api/story/export/${EXPORT_ID}/download`);
}

function makeParams(exportId = EXPORT_ID) {
  return { params: Promise.resolve({ exportId }) };
}

function makeMp4Stream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Minimal ftyp box header bytes
      controller.enqueue(new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// ── T1: Unauthenticated ────────────────────────────────────────────────────

describe('T1: unauthenticated request', () => {
  it('returns 401 when no cookie is present', async () => {
    mockGetCookie.mockReturnValue(null);
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 401 when token fails verification', async () => {
    mockGetCookie.mockReturnValue('expired-token');
    mockVerify.mockImplementation(() => { throw new Error('invalid'); });
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(401);
  });
});

// ── T2: Wrong user ─────────────────────────────────────────────────────────

describe('T2: authenticated request for another user\'s export', () => {
  it('returns 404 when the export does not belong to the authenticated user', async () => {
    mockGetCookie.mockReturnValue('valid-token');
    mockVerify.mockReturnValue({ sub: 'user-alice' } as any);
    mockFindFirst.mockResolvedValue(null); // ownership check fails
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(404);
    // Verify ownership query used the authenticated user's id, not one from the request
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-alice' }) }),
    );
  });
});

// ── T3: Export not READY ───────────────────────────────────────────────────

describe('T3: export exists but is not READY', () => {
  beforeEach(() => {
    mockGetCookie.mockReturnValue('valid-token');
    mockVerify.mockReturnValue({ sub: 'user-bob' } as any);
  });

  it('returns 404 when status is PENDING', async () => {
    mockFindFirst.mockResolvedValue({ status: 'PENDING', assetUrl: null } as any);
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 404 when status is GENERATING', async () => {
    mockFindFirst.mockResolvedValue({ status: 'GENERATING', assetUrl: null } as any);
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 404 when status is FAILED', async () => {
    mockFindFirst.mockResolvedValue({ status: 'FAILED', assetUrl: null } as any);
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(404);
  });
});

// ── T4 + T5: Authorized READY export ──────────────────────────────────────

describe('T4+T5: authorized READY export', () => {
  beforeEach(() => {
    mockGetCookie.mockReturnValue('valid-token');
    mockVerify.mockReturnValue({ sub: 'user-bob' } as any);
    mockFindFirst.mockResolvedValue(READY_ROW as any);
    vi.mocked(global.fetch as any).mockResolvedValue({
      ok: true,
      body: makeMp4Stream(),
      headers: new Headers({ 'content-length': '8' }),
    });
  });

  it('T4: returns 200', async () => {
    const res = await GET(makeReq() as any, makeParams());
    expect(res.status).toBe(200);
  });

  it('T5: response has Content-Type video/mp4', async () => {
    const res = await GET(makeReq() as any, makeParams());
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  it('T5: response has Content-Disposition attachment with filename', async () => {
    const res = await GET(makeReq() as any, makeParams());
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain('my-story.mp4');
  });

  it('T5: response body is non-empty', async () => {
    const res = await GET(makeReq() as any, makeParams());
    expect(res.body).not.toBeNull();
  });

  it('T5: Content-Length is forwarded from upstream', async () => {
    const res = await GET(makeReq() as any, makeParams());
    expect(res.headers.get('content-length')).toBe('8');
  });

  it('route fetches the stored asset URL, not a client-supplied URL', async () => {
    await GET(makeReq() as any, makeParams());
    expect(vi.mocked(global.fetch as any)).toHaveBeenCalledWith(ASSET_URL);
    expect(vi.mocked(global.fetch as any)).toHaveBeenCalledTimes(1);
  });
});
