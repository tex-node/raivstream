/**
 * POST /api/paystack/initialize
 *
 * Body: { type: 'SUBSCRIPTION' } | { type: 'CREDIT_PURCHASE', packageTag: string }
 *
 * Returns: { url: string } — redirect the user to this Paystack checkout URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { verifyAccessToken, extractBearerToken } from '@raivstream/api/src/lib/jwt';
import {
  initializeSubscription,
  initializeCreditPurchase,
  type CreditPackageTag,
} from '@/lib/paystack';

export async function POST(req: NextRequest) {
  // Auth
  const token = extractBearerToken(req.headers.get('authorization'));
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const body = await req.json() as { type: string; packageTag?: string };

  try {
    if (body.type === 'SUBSCRIPTION') {
      if (!process.env.PAYSTACK_VIEWER_PLAN_CODE) {
        return NextResponse.json(
          { error: 'Viewer plan not configured — set PAYSTACK_VIEWER_PLAN_CODE' },
          { status: 500 },
        );
      }
      const result = await initializeSubscription(
        user.email,
        userId,
        `${appUrl}/subscription/success?provider=paystack`,
      );
      return NextResponse.json({ url: result.authorization_url });

    } else if (body.type === 'CREDIT_PURCHASE') {
      const result = await initializeCreditPurchase(
        user.email,
        userId,
        (body.packageTag ?? 'starter') as CreditPackageTag,
        `${appUrl}/credits/success?provider=paystack`,
      );
      return NextResponse.json({ url: result.authorization_url });

    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err) {
    console.error('[paystack/initialize]', err);
    return NextResponse.json({ error: 'Failed to initialize payment' }, { status: 500 });
  }
}
