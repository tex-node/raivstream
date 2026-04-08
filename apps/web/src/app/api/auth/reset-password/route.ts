import { NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { resetPassword } from '@raivstream/api/src/lib/authService';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: string; password?: string };
    const { token = '', password = '' } = body;

    if (!token) {
      return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'Password is too long' }, { status: 400 });
    }

    await resetPassword(prisma, token, password);

    return NextResponse.json({ success: true });
  } catch (err) {
    const e = err as Error & { code?: string };
    const status = e.code === 'UNAUTHORIZED' ? 400 : 500;
    return NextResponse.json(
      { error: e.message ?? 'Internal server error' },
      { status },
    );
  }
}
