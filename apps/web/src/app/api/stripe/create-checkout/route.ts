import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { stripe, PLANS, type PlanKey } from '@/lib/stripe';
import { verifyAccessToken, extractBearerToken } from '@raivstream/api/src/lib/jwt';

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId: string;
  try {
    const payload = verifyAccessToken(token);
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan } = (await req.json()) as { plan: PlanKey };
  const selectedPlan = PLANS[plan];
  if (!selectedPlan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const existingSub = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: existingSub?.stripeCustomerId ?? undefined,
    customer_email: existingSub?.stripeCustomerId ? undefined : user.email,
    line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
    success_url: `${appUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing`,
    metadata: {
      userId: user.id,
      plan: selectedPlan.tier,
    },
    subscription_data: {
      metadata: { userId: user.id, plan: selectedPlan.tier },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
