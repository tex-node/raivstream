/**
 * Paystack integration — primary payment processor (NGN / local)
 *
 * Viewer subscription: ₦1,500/month (plan-based, recurring)
 * Creator credits:     ₦1,000 = 1,000 credits (one-time charge)
 */

import crypto from 'crypto';

export const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── Plans ────────────────────────────────────────────────────────────────────

export const VIEWER_PLAN = {
  name: 'Raivstream Viewer',
  amountKobo: 150_000,      // ₦1,500 in kobo
  interval: 'monthly',
  tier: 'VIEWER' as const,
  // Set PAYSTACK_VIEWER_PLAN_CODE after creating the plan in Paystack dashboard
  planCode: process.env.PAYSTACK_VIEWER_PLAN_CODE ?? '',
};

// ─── Credit packages ─────────────────────────────────────────────────────────

export const CREDIT_PACKAGES = [
  { credits: 1_000,  amountKobo:  100_000, label: '1,000 credits',  tag: 'starter' },
  { credits: 5_000,  amountKobo:  450_000, label: '5,000 credits',  tag: 'popular', saving: '10% off' },
  { credits: 10_000, amountKobo:  800_000, label: '10,000 credits', tag: 'pro',     saving: '20% off' },
] as const;

export type CreditPackageTag = typeof CREDIT_PACKAGES[number]['tag'];

// ─── API helpers ─────────────────────────────────────────────────────────────

interface PaystackInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface PaystackVerifyResult {
  status: string;          // 'success' | 'failed' | 'abandoned'
  amount: number;          // in kobo
  reference: string;
  customer: { email: string; customer_code: string };
  metadata: Record<string, string>;
  subscription?: { subscription_code: string; plan: { plan_code: string } };
}

async function paystackPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as { status: boolean; data: T; message: string };
  if (!json.status) throw new Error(`Paystack error: ${json.message}`);
  return json.data;
}

async function paystackGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const json = await res.json() as { status: boolean; data: T; message: string };
  if (!json.status) throw new Error(`Paystack error: ${json.message}`);
  return json.data;
}

// Initialize a viewer subscription charge
export async function initializeSubscription(
  email: string,
  userId: string,
  callbackUrl: string,
): Promise<PaystackInitResult> {
  return paystackPost<PaystackInitResult>('/transaction/initialize', {
    email,
    amount: VIEWER_PLAN.amountKobo,
    plan:   VIEWER_PLAN.planCode,
    callback_url: callbackUrl,
    metadata: { userId, type: 'SUBSCRIPTION', tier: VIEWER_PLAN.tier },
  });
}

// Initialize a creator credit purchase
export async function initializeCreditPurchase(
  email: string,
  userId: string,
  packageTag: CreditPackageTag,
  callbackUrl: string,
): Promise<PaystackInitResult> {
  const pkg = CREDIT_PACKAGES.find((p) => p.tag === packageTag);
  if (!pkg) throw new Error(`Unknown credit package: ${packageTag}`);

  return paystackPost<PaystackInitResult>('/transaction/initialize', {
    email,
    amount: pkg.amountKobo,
    callback_url: callbackUrl,
    metadata: { userId, type: 'CREDIT_PURCHASE', packageTag, credits: String(pkg.credits) },
  });
}

// Verify a completed transaction
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  return paystackGet<PaystackVerifyResult>(`/transaction/verify/${reference}`);
}

// Cancel a subscription
export async function disableSubscription(subscriptionCode: string, emailToken: string): Promise<void> {
  await paystackPost('/subscription/disable', { code: subscriptionCode, token: emailToken });
}

// ─── Webhook signature verification ──────────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(payload)
    .digest('hex');
  return expected === signature;
}
