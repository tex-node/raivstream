/**
 * POST /api/paystack/webhook
 *
 * Receives Paystack events for recurring billing.
 * Register this URL in Paystack Dashboard → Settings → API & Webhooks.
 *
 * Events handled:
 *   charge.success          — one-time payment or first subscription charge
 *   subscription.create     — subscription activated
 *   subscription.disable    — subscription cancelled
 *   invoice.payment_failed  — recurring charge failed
 *   invoice.update          — recurring charge succeeded (renewal)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { verifyWebhookSignature, VIEWER_PLAN } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-paystack-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[paystack/webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as { event: string; data: Record<string, unknown> };

  try {
    await handleEvent(event.event, event.data);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[paystack/webhook] Handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

async function handleEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
  switch (eventType) {

    case 'subscription.create': {
      const sub = data as {
        subscription_code: string;
        customer: { customer_code: string };
        plan: { plan_code: string };
        next_payment_date: string;
        status: string;
      };

      // Find the subscription by customer code and activate it
      await prisma.subscription.updateMany({
        where: { paystackCustomerCode: sub.customer.customer_code },
        data: {
          paystackSubscriptionCode: sub.subscription_code,
          paystackPlanCode: sub.plan.plan_code,
          status: 'active',
          currentPeriodEnd: new Date(sub.next_payment_date),
        },
      });
      break;
    }

    case 'invoice.update': {
      // Recurring subscription renewal succeeded
      const invoice = data as {
        subscription: { subscription_code: string; customer: { customer_code: string } };
        paid_at: string;
        next_payment_date?: string;
        amount: number;
      };

      const sub = await prisma.subscription.findFirst({
        where: { paystackSubscriptionCode: invoice.subscription?.subscription_code },
      });

      if (sub) {
        const periodEnd = invoice.next_payment_date
          ? new Date(invoice.next_payment_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'active',
              currentPeriodStart: new Date(invoice.paid_at),
              currentPeriodEnd: periodEnd,
            },
          }),
          prisma.user.update({
            where: { id: sub.userId },
            data: { premiumTier: 'VIEWER', premiumUntil: periodEnd },
          }),
        ]);
      }
      break;
    }

    case 'subscription.disable': {
      const sub = data as {
        subscription_code: string;
        customer: { customer_code: string };
      };

      const record = await prisma.subscription.findFirst({
        where: { paystackSubscriptionCode: sub.subscription_code },
      });

      if (record) {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: record.id },
            data: { status: 'cancelled', cancelAtPeriodEnd: true },
          }),
          // Don't revoke access immediately — let it expire at period end
        ]);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = data as {
        subscription: { subscription_code: string };
      };

      await prisma.subscription.updateMany({
        where: { paystackSubscriptionCode: invoice.subscription?.subscription_code },
        data: { status: 'past_due' },
      });
      break;
    }

    default:
      // Silently ignore unhandled events
      break;
  }
}
