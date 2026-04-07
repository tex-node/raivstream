/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe events and validates the signature before processing.
 * NEVER process a webhook without signature verification — anyone can POST
 * fake "payment_succeeded" events to this endpoint otherwise.
 *
 * Setup:
 *   1. Set STRIPE_WEBHOOK_SECRET in .env (from Stripe Dashboard → Webhooks → signing secret)
 *   2. Register this URL in Stripe Dashboard:  https://yourdomain.com/api/stripe/webhook
 *   3. Select events: customer.subscription.created/updated/deleted, invoice.payment_succeeded/failed
 */

import Stripe from 'stripe';
import { prisma } from '@raivstream/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Events we handle — ignore all others (defence in depth)
const HANDLED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'checkout.session.completed',
]);

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Read raw body — must NOT be parsed as JSON before verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // Invalid signature — reject immediately, log for monitoring
    console.error('[stripe/webhook] Signature verification failed:', err);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  // Ignore events we don't handle
  if (!HANDLED_EVENTS.has(event.type)) {
    return new Response('Event type not handled', { status: 200 });
  }

  try {
    await handleEvent(event);
    return new Response('OK', { status: 200 });
  } catch (err) {
    // Log full error server-side; return generic message to Stripe
    console.error('[stripe/webhook] Handler error:', err);
    // Return 500 → Stripe will retry with exponential backoff
    return new Response('Handler error', { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const tier = deriveTier(sub.items.data[0]?.price.id);

      await prisma.subscription.upsert({
        where:  { stripeSubscriptionId: sub.id },
        create: {
          stripeCustomerId:    customerId,
          stripeSubscriptionId: sub.id,
          stripePriceId:       sub.items.data[0]?.price.id ?? '',
          tier,
          status:              sub.status,
          currentPeriodStart:  new Date(sub.current_period_start * 1000),
          currentPeriodEnd:    new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd:   sub.cancel_at_period_end,
          user:                { connect: { id: (await getUserIdFromCustomer(customerId)) ?? '' } },
        },
        update: {
          stripePriceId:      sub.items.data[0]?.price.id ?? '',
          tier,
          status:             sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd:   new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd:  sub.cancel_at_period_end,
        },
      });

      // Update user's premiumTier based on subscription status
      if (sub.status === 'active' || sub.status === 'trialing') {
        const userId = await getUserIdFromCustomer(customerId);
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data:  { premiumTier: tier, premiumUntil: new Date(sub.current_period_end * 1000) },
          });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data:  { status: 'canceled' },
      });
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const userId = await getUserIdFromCustomer(customerId);
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data:  { premiumTier: 'FREE', premiumUntil: null },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      if (subId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data:  { status: 'past_due' },
        });
      }
      break;
    }

    case 'checkout.session.completed': {
      // Subscription creation via Checkout is handled by subscription.created
      break;
    }
  }
}

function deriveTier(priceId?: string): 'FREE' | 'VIEWER_PREMIUM' | 'CREATOR_PREMIUM' | 'ULTIMATE' {
  if (!priceId) return 'FREE';
  if (priceId === process.env.STRIPE_VIEWER_PREMIUM_PRICE_ID)  return 'VIEWER_PREMIUM';
  if (priceId === process.env.STRIPE_CREATOR_PREMIUM_PRICE_ID) return 'CREATOR_PREMIUM';
  if (priceId === process.env.STRIPE_ULTIMATE_PRICE_ID)        return 'ULTIMATE';
  return 'FREE';
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({
    where:  { stripeCustomerId: customerId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}
