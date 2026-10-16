import { PrismaClient, BadgeType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Categories
  console.log('Creating categories...');
  const categories = [
    { name: 'Comedy', slug: 'comedy', description: 'Funny and entertaining content', icon: '😂' },
    { name: 'Music', slug: 'music', description: 'Musical performances and covers', icon: '🎵' },
    { name: 'Dance', slug: 'dance', description: 'Dance videos and choreography', icon: '💃' },
    { name: 'Education', slug: 'education', description: 'Educational and how-to content', icon: '📚' },
    { name: 'Gaming', slug: 'gaming', description: 'Gaming clips and highlights', icon: '🎮' },
    { name: 'Food', slug: 'food', description: 'Cooking and food content', icon: '🍳' },
    { name: 'Fitness', slug: 'fitness', description: 'Workout and fitness tips', icon: '💪' },
    { name: 'Travel', slug: 'travel', description: 'Travel vlogs and destinations', icon: '✈️' },
    { name: 'Fashion', slug: 'fashion', description: 'Fashion and style content', icon: '👗' },
    { name: 'Tech', slug: 'tech', description: 'Technology and gadgets', icon: '📱' },
    { name: 'Pets', slug: 'pets', description: 'Cute and funny pet videos', icon: '🐶' },
    { name: 'DIY', slug: 'diy', description: 'Do it yourself projects', icon: '🔨' },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }

  // Seed Badges
  console.log('Creating badges...');
  const badges = [
    {
      type: BadgeType.TOP_VIEWED_WEEK,
      name: 'Top Viewed',
      description: 'Most viewed video this week',
      iconUrl: '/badges/top-viewed.svg',
    },
    {
      type: BadgeType.TOP_LIKED_WEEK,
      name: 'Most Loved',
      description: 'Most liked video this week',
      iconUrl: '/badges/most-loved.svg',
    },
    {
      type: BadgeType.HIGHEST_ENGAGEMENT_WEEK,
      name: 'Peak Engagement',
      description: 'Highest engagement score this week',
      iconUrl: '/badges/peak-engagement.svg',
    },
    {
      type: BadgeType.VIEWERS_PICK_WEEK,
      name: "Viewer's Pick",
      description: "Featured in this week's Viewer's Pick",
      iconUrl: '/badges/viewers-pick.svg',
    },
    {
      type: BadgeType.VIRAL_HIT,
      name: 'Viral Hit',
      description: 'Reached 100K+ views in 24 hours',
      iconUrl: '/badges/viral.svg',
    },
    {
      type: BadgeType.CREATOR_MILESTONE_1K,
      name: '1K Followers',
      description: 'Reached 1,000 followers',
      iconUrl: '/badges/1k-followers.svg',
    },
    {
      type: BadgeType.CREATOR_MILESTONE_10K,
      name: '10K Followers',
      description: 'Reached 10,000 followers',
      iconUrl: '/badges/10k-followers.svg',
    },
    {
      type: BadgeType.CREATOR_MILESTONE_100K,
      name: '100K Followers',
      description: 'Reached 100,000 followers',
      iconUrl: '/badges/100k-followers.svg',
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { type: badge.type },
      update: badge,
      create: badge,
    });
  }

  // Seed Feature Credit Rates
  // featureKey format: "category:model_or_feature"
  // 1,000 credits = ₦1,000 — rates reflect relative model cost
  console.log('Creating feature credit rates...');
  const creditRates = [
    // ── AI video generation models ──────────────────────────────────────────
    {
      featureKey:     'generate:nano_banana',
      creditsPerUnit: 50,
      unitLabel:      'request',
      description:    'Nano Banana — fast, lightweight video generation (₦50/gen)',
    },
    {
      featureKey:     'generate:grok_imagine',
      creditsPerUnit: 100,
      unitLabel:      'request',
      description:    'Grok Imagine — image-to-video generation (₦100/gen)',
    },
    {
      featureKey:     'generate:ltx2',
      creditsPerUnit: 150,
      unitLabel:      'request',
      description:    'LTX-2 — mid-quality text-to-video (₦150/gen)',
    },
    {
      featureKey:     'generate:wan_25',
      creditsPerUnit: 200,
      unitLabel:      'request',
      description:    'Wan 2.5 — high-quality open-source video model (₦200/gen)',
    },
    {
      featureKey:     'generate:seedance',
      creditsPerUnit: 200,
      unitLabel:      'request',
      description:    'Seedance 1.0 — ByteDance high-quality video model (₦200/gen)',
    },
    {
      featureKey:     'generate:flux',
      creditsPerUnit: 80,
      unitLabel:      'request',
      description:    'Flux.1 Dev — high-quality image generation (₦80/gen)',
    },
    {
      featureKey:     'generate:hunyuan_video',
      creditsPerUnit: 300,
      unitLabel:      'request',
      description:    'HunyuanVideo — 720p video on A100 GPU (₦300/gen)',
    },
    {
      featureKey:     'generate:cog_video_x',
      creditsPerUnit: 250,
      unitLabel:      'request',
      description:    'CogVideoX — smooth motion video generation (₦250/gen)',
    },
    {
      featureKey:     'generate:higgsfield',
      creditsPerUnit: 400,
      unitLabel:      'request',
      description:    'Higgsfield — cinematic AI video generation (₦400/gen)',
    },
    {
      featureKey:     'generate:kling_i2v',
      creditsPerUnit: 500,
      unitLabel:      'request',
      description:    'Kling I2V — image-to-video, hyper-realistic motion (₦500/gen)',
    },
    {
      featureKey:     'generate:kling_r2v',
      creditsPerUnit: 450,
      unitLabel:      'request',
      description:    'Kling R2V — reference-guided text-to-video (₦450/gen)',
    },
    // ── fal.ai models (placeholder rates — reconcile after provider cost measurement) ──
    {
      featureKey:     'generate:flux2',
      creditsPerUnit: 80,
      unitLabel:      'request',
      description:    'Flux 2 (fal.ai) — high-quality text-to-image (₦80/gen)',
    },
    {
      featureKey:     'generate:h3_max',
      creditsPerUnit: 200,
      unitLabel:      'request',
      description:    'MiniMax H3-Max (fal.ai) — image-to-video (₦200/gen)',
    },
    // ── Per-second video pricing (VIDEO_PER_SECOND_PRICING flag) ────────────
    // Rate = credits per second of generated video. ≥ 40% margin on Pro pack (₦0.80/cr).
    // Rates set 2026-10-16 (owner decision). fal prices:
    // H3 turbo:  480P $0.025/s → 80 cr/s; 768P $0.04/s → 128 cr/s; 1080P $0.08/s → 256 cr/s
    // Recast:    768P $0.30/s → 850 cr/s; 1080P $0.45/s → 1,250 cr/s
    // RTV:       480P $0.05/s → 140 cr/s; 768P $0.08/s → 225 cr/s; 1080P $0.16/s → 450 cr/s
    // VEED Fabric: 480p $0.08/s → 225 cr/s; 720p $0.15/s → 420 cr/s
    // VEED lipsync $0.07/s → 200 cr/s; VEED avatar $0.35/min → 20 cr/s (1,200/min flat)
    {
      featureKey:     'generate:h3_max_480p',
      creditsPerUnit: 80,
      unitLabel:      'second',
      description:    'MiniMax H3-Max 480P — per-second billing (80 cr/s)',
    },
    {
      featureKey:     'generate:h3_max_768p',
      creditsPerUnit: 128,
      unitLabel:      'second',
      description:    'MiniMax H3-Max 768P — per-second billing (128 cr/s)',
    },
    {
      featureKey:     'generate:h3_max_1080p',
      creditsPerUnit: 256,
      unitLabel:      'second',
      description:    'MiniMax H3-Max 1080P — per-second billing (256 cr/s)',
    },
    {
      featureKey:     'generate:minimax_recast_768p',
      creditsPerUnit: 850,
      unitLabel:      'second',
      description:    'MiniMax video-recast 768P — per-second billing (850 cr/s)',
    },
    {
      featureKey:     'generate:minimax_recast_1080p',
      creditsPerUnit: 1250,
      unitLabel:      'second',
      description:    'MiniMax video-recast 1080P — per-second billing (1,250 cr/s)',
    },
    {
      featureKey:     'generate:minimax_rtv_480p',
      creditsPerUnit: 140,
      unitLabel:      'second',
      description:    'MiniMax reference-to-video 480P — per-second billing (140 cr/s)',
    },
    {
      featureKey:     'generate:minimax_rtv_768p',
      creditsPerUnit: 225,
      unitLabel:      'second',
      description:    'MiniMax reference-to-video 768P — per-second billing (225 cr/s)',
    },
    {
      featureKey:     'generate:minimax_rtv_1080p',
      creditsPerUnit: 450,
      unitLabel:      'second',
      description:    'MiniMax reference-to-video 1080P — per-second billing (450 cr/s)',
    },
    {
      featureKey:     'generate:veed_fabric',
      creditsPerUnit: 300,
      unitLabel:      'request',
      description:    'VEED Fabric (fal.ai) — talking-video lip-sync (₦300/gen)',
    },
    {
      featureKey:     'generate:veed_fabric_480p',
      creditsPerUnit: 225,
      unitLabel:      'second',
      description:    'VEED Fabric 480p — per-second billing (225 cr/s)',
    },
    {
      featureKey:     'generate:veed_fabric_720p',
      creditsPerUnit: 420,
      unitLabel:      'second',
      description:    'VEED Fabric 720p — per-second billing (420 cr/s)',
    },
    {
      featureKey:     'generate:veed_lipsync',
      creditsPerUnit: 200,
      unitLabel:      'second',
      description:    'VEED lipsync — per-second billing (200 cr/s)',
    },
    {
      featureKey:     'generate:veed_avatar',
      creditsPerUnit: 20,
      unitLabel:      'second',
      description:    'VEED avatar — per-second billing (20 cr/s; ~1,200 cr/min)',
    },
    // ── Other AI features ───────────────────────────────────────────────────
    {
      featureKey:     'thumbnail:ai',
      creditsPerUnit: 20,
      unitLabel:      'image',
      description:    'AI-generated video thumbnail (₦20/image)',
    },
    {
      featureKey:     'video:transcribe',
      creditsPerUnit: 30,
      unitLabel:      'request',
      description:    'AI speech-to-text transcription (₦30/video)',
    },
    {
      featureKey:     'video:enhance',
      creditsPerUnit: 100,
      unitLabel:      'request',
      description:    'AI video upscaling / enhancement (₦100/video)',
    },
    // ── Creative 5.0 audio pipeline (Phase 6C) ─────────────────────────────
    {
      featureKey:     'story:audio_generation',
      creditsPerUnit: 100,
      unitLabel:      'track',
      description:    'Creative 5.0 — AI music generation via Google Lyria (₦100/track)',
    },
  ];

  for (const rate of creditRates) {
    await prisma.featureCreditRate.upsert({
      where:  { featureKey: rate.featureKey },
      update: rate,
      create: rate,
    });
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
