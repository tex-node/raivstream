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
    price: 1.99,
    priceId: process.env.STRIPE_VIEWER_PRICE_ID!,
    tier: 'VIEWER' as const,
    features: [
      'Ad-free viewing',
      'HD quality streams',
      'Unlimited episodes',
      'Exclusive premium content',
    ],
  },
  CREATOR: {
    name: 'Creator',
    price: 4.99,
    priceId: process.env.STRIPE_CREATOR_PRICE_ID!,
    tier: 'CREATOR' as const,
    features: [
      'Everything in Viewer',
      'Upload unlimited videos',
      'Buy & use AI credits',
      'Creator analytics dashboard',
      'Revenue sharing (70/30)',
    ],
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLANS;
