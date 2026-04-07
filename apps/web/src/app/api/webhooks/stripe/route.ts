import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@raivstream/database';
import { stripe } from '@/lib/stripe';
import type { PremiumTier } from '@raivstream/database';

const TIER_MAP: Record<string, PremiumTier> = {
  VIEWER_PREMIUM: 'VIEWER_PREMIUM',
  CREATOR_PREMIUM: 'CREATOR_PREMIUM',
  ULTIMATE: 'ULTIMATE',
};

async function upsertSubscription(
  subscription: Stripe.Subscription,
  userId?: string
) {
  const resolvedUserId =
    userId ?? (subscription.metadata?.userId as string | undefined);
  if (!resolvedUserId) return;

  const tier = TIER_MAP[subscription.metadata?.plan ?? ''] ?? 'FREE';
  const priceId = subscription.items.data[0]?.price.id ?? '';

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const periodStart = new Date((subscription.current_period_start ?? 0) * 1000);
  const periodEnd = new Date((subscription.current_period_end ?? 0) * 1000);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId: resolvedUserId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Update the user's premiumTier
  const isActive = ['active', 'trialing'].includes(subscription.status);
  await prisma.user.update({
    where: { id: resolvedUserId },
    data: {
      premiumTier: isActive ? tier : 'FREE',
      premiumUntil: isActive ? periodEnd : null,
      // Upgrade to CREATOR role if on a creator-capable plan
      role:
        isActive && (tier === 'CREATOR_PREMIUM' || tier === 'ULTIMATE')
          ? 'CREATOR'
          : undefined,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        await upsertSubscription(subscription, session.metadata?.userId);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'canceled' },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { premiumTier: 'FREE', premiumUntil: null },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: 'past_due' },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
