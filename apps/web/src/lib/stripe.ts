import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// Stripe plans — international payments only
// Primary payment is handled by Paystack (see lib/paystack.ts)
export const STRIPE_PLANS = {
  VIEWER: {
    name: 'Viewer',
    priceId: process.env.STRIPE_VIEWER_PRICE_ID!,
    tier: 'VIEWER' as const,
  },
  CREATOR: {
    name: 'Creator',
    priceId: process.env.STRIPE_CREATOR_PRICE_ID!,
    tier: 'CREATOR' as const,
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLANS;
