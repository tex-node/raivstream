/**
 * GET /api/paystack/verify?reference=xxx
 *
 * Called from the success page after Paystack redirects back.
 * Verifies the transaction and activates subscription / credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, type PrismaClient } from '@raivstream/database';
import { verifyTransaction, VIEWER_PLAN, CREDIT_PACKAGES } from '@/lib/paystack';

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference');
  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  let tx;
  try {
    tx = await verifyTransaction(reference);
  } catch (err) {
    console.error('[paystack/verify]', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 502 });
  }

  if (tx.status !== 'success') {
    return NextResponse.json({ error: `Payment status: ${tx.status}` }, { status: 400 });
  }

  const { userId, type, packageTag, credits } = tx.metadata;

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId in metadata' }, { status: 400 });
  }

  if (type === 'SUBSCRIPTION') {
    // Activate viewer subscription for 30 days
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { paystackCustomerCode: tx.customer.customer_code },
        create: {
          userId,
          provider: 'paystack',
          paystackCustomerCode:     tx.customer.customer_code,
          paystackSubscriptionCode: tx.subscription?.subscription_code ?? null,
          paystackPlanCode:         VIEWER_PLAN.planCode,
          tier:    'VIEWER',
          status:  'active',
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
        },
        update: {
          paystackSubscriptionCode: tx.subscription?.subscription_code ?? undefined,
          status:  'active',
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { premiumTier: 'VIEWER', premiumUntil: periodEnd },
      }),
    ]);

    return NextResponse.json({ success: true, type: 'SUBSCRIPTION', tier: 'VIEWER' });

  } else if (type === 'CREDIT_PURCHASE') {
    const creditAmount = parseInt(credits ?? '0', 10);
    if (!creditAmount) {
      return NextResponse.json({ error: 'Invalid credit amount' }, { status: 400 });
    }

    // Upsert credit balance and record transaction
    await prisma.$transaction(async (tx_: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const balance = await tx_.creditBalance.upsert({
        where:  { userId },
        create: { userId, balance: creditAmount },
        update: { balance: { increment: creditAmount } },
      });

      const pkg = CREDIT_PACKAGES.find((p) => p.tag === packageTag);

      await tx_.creditTransaction.create({
        data: {
          userId,
          amount:       creditAmount,
          type:         'PURCHASE',
          description:  pkg?.label ?? `${creditAmount} credits`,
          referenceId:  reference,
          balanceBefore: balance.balance - creditAmount,
          balanceAfter:  balance.balance,
        },
      });

      // Ensure user has CREATOR role
      await tx_.user.update({
        where: { id: userId },
        data: { role: 'CREATOR', premiumTier: 'CREATOR' },
      });
    });

    return NextResponse.json({ success: true, type: 'CREDIT_PURCHASE', credits: creditAmount });
  }

  return NextResponse.json({ error: 'Unknown payment type' }, { status: 400 });
}
