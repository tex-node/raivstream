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
