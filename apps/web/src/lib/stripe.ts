import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

export const PLANS = {
  VIEWER_PREMIUM: {
    name: 'Viewer Premium',
    price: 4.99,
    priceId: process.env.STRIPE_VIEWER_PREMIUM_PRICE_ID!,
    tier: 'VIEWER_PREMIUM' as const,
    features: [
      'Ad-free viewing',
      'HD quality streams',
      'Exclusive premium content',
      'Early access to new features',
    ],
  },
  CREATOR_PREMIUM: {
    name: 'Creator Premium',
    price: 9.99,
    priceId: process.env.STRIPE_CREATOR_PREMIUM_PRICE_ID!,
    tier: 'CREATOR_PREMIUM' as const,
    features: [
      'Everything in Viewer Premium',
      'Upload unlimited videos',
      'Creator analytics dashboard',
      'Revenue sharing (70/30)',
      'Priority processing',
    ],
  },
  ULTIMATE: {
    name: 'Ultimate',
    price: 14.99,
    priceId: process.env.STRIPE_ULTIMATE_PRICE_ID!,
    tier: 'ULTIMATE' as const,
    features: [
      'Everything in Creator Premium',
      'Priority support',
      'Featured placement eligibility',
      'Advanced analytics',
      'Early beta features',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
