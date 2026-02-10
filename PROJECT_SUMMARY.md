# Raivstream - Complete Project Overview

## Executive Summary

Raivstream is a premium short-form vertical video streaming platform that combines TikTok's engaging UGC feed with Netflix's premium subscription model. Built with modern, scalable technologies, it provides a seamless experience for both content creators and viewers.

## Project Structure

```
raivstream/
├── apps/
│   ├── web/                    # Next.js 15 web application
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router pages
│   │   │   ├── components/    # React components
│   │   │   └── lib/           # Utilities and helpers
│   │   └── package.json
│   │
│   └── mobile/                 # React Native + Expo mobile app
│       ├── app/               # Expo Router screens
│       ├── components/        # React Native components
│       ├── hooks/             # Custom React hooks
│       └── package.json
│
├── packages/
│   ├── database/              # Prisma schema and database utilities
│   │   ├── schema.prisma     # Complete database schema
│   │   ├── seed.ts           # Database seeding script
│   │   └── index.ts          # Prisma client singleton
│   │
│   ├── api/                   # tRPC API layer
│   │   └── src/
│   │       ├── routers/      # API route handlers
│   │       └── index.ts      # tRPC server setup
│   │
│   ├── jobs/                  # Inngest background jobs
│   │   └── src/
│   │       └── functions/    # Job definitions
│   │
│   ├── ui/                    # Shared UI components
│   └── config/                # Shared configurations
│
├── infrastructure/            # IaC and deployment configs
├── docs/                      # Documentation
├── .github/workflows/         # CI/CD pipelines
└── docker-compose.yml         # Local development stack
```

## Technology Stack

### Frontend
- **Web**: Next.js 15, React 18, TypeScript, Tailwind CSS
- **Mobile**: React Native 0.73, Expo SDK 50, Expo Router
- **State Management**: TanStack Query (React Query), Zustand
- **Video Player**: 
  - Web: Video.js + HLS.js
  - Mobile: react-native-video + expo-av

### Backend
- **API**: tRPC for end-to-end type safety
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache**: Redis (Upstash for serverless)
- **Auth**: Clerk
- **Payments**: Stripe

### Video Infrastructure
- **Storage**: AWS S3 / Cloudflare R2
- **CDN**: CloudFront / Cloudflare CDN
- **Transcoding**: AWS MediaConvert
- **Format**: HLS adaptive streaming (9:16 vertical)

### DevOps & Monitoring
- **Hosting**: Vercel (web), Expo EAS (mobile)
- **Background Jobs**: Inngest
- **Error Tracking**: Sentry
- **Analytics**: PostHog
- **CI/CD**: GitHub Actions

## Core Features

### For Viewers
1. **Infinite Vertical Feed**
   - For You (personalized recommendations)
   - Following (creators you follow)
   - Trending (popular content)
   - Viewer's Pick (weekly featured)

2. **Multi-Dimensional Engagement**
   - Like/Dislike
   - 1-5 Star ratings
   - View tracking with completion rate
   - Watch time analytics

3. **Premium Tiers**
   - Free: All public content with ads
   - Viewer Premium ($4.99/mo): Ad-free, exclusive content, HD quality
   - Creator Premium ($9.99/mo): All viewer features + creator tools
   - Ultimate ($14.99/mo): Everything + priority support

4. **Discovery Features**
   - Full-text search
   - Category browsing
   - Tag exploration
   - Creator profiles

### For Creators
1. **Content Management**
   - Easy video upload (15-60 seconds, 9:16 format)
   - Automatic transcoding to multiple qualities
   - Thumbnail generation
   - Tag and category management

2. **Analytics Dashboard**
   - Views, likes, engagement metrics
   - Audience demographics
   - Watch time and completion rates
   - Revenue tracking

3. **Monetization**
   - Revenue share program (70/30 split)
   - Subscription tiers
   - Premium content gating
   - Badge rewards system

4. **Recognition**
   - Verification badges
   - Weekly achievement badges
   - Featured placements
   - Creator milestones (1K, 10K, 100K followers)

## Database Schema

Key Models:
- **User**: Authentication, profile, premium tier
- **Video**: Metadata, stats, HLS URLs
- **VideoInteraction**: Likes, dislikes, ratings, watch time
- **WatchHistory**: Detailed viewing history
- **Follow**: Creator-viewer relationships
- **Badge**: Achievement system
- **Subscription**: Stripe integration
- **FeaturedContent**: Weekly picks and trending

## API Routes (tRPC)

### Video Routes
- `video.requestUpload` - Get presigned S3 URL
- `video.getById` - Fetch video details
- `video.updateMetadata` - Edit video info
- `video.delete` - Remove video
- `video.getMyVideos` - Creator's video list

### Feed Routes
- `feed.forYou` - Personalized recommendations
- `feed.following` - Content from followed creators
- `feed.trending` - Popular videos
- `feed.viewersPick` - Weekly featured content

### Interaction Routes
- `interaction.toggleLike` - Like video
- `interaction.toggleDislike` - Dislike video
- `interaction.setRating` - Set 1-5 star rating
- `interaction.trackProgress` - Track watch time

### User Routes
- `user.getProfile` - Get user profile
- `user.updateProfile` - Update profile
- `user.becomeCreator` - Creator onboarding
- `user.follow` - Follow creator

## Background Jobs (Inngest)

1. **Video Processing**
   - `transcodeVideo`: Convert uploads to HLS
   - `generateThumbnail`: Extract video thumbnail
   - `updateVideoStats`: Sync view counts from Redis

2. **Analytics**
   - `computeEngagementScores`: Calculate video engagement
   - `syncVideoStats`: Batch update from cache
   - `refreshMaterializedViews`: Update DB views

3. **Recommendations**
   - `updateRecommendations`: Refresh user feed cache
   - `computeSimilarVideos`: Find related content

4. **Rewards**
   - `selectWeeklyPicks`: Choose featured videos
   - `awardBadges`: Grant achievement badges
   - `checkMilestones`: Track follower milestones

## Recommendation Algorithm

Hybrid system combining:

1. **Content-Based Filtering** (40%)
   - Tag matching
   - Category affinity
   - Creator preference

2. **Quality Scoring** (30%)
   - Engagement rate
   - Star ratings
   - Completion rate
   - Like/dislike ratio

3. **Recency** (20%)
   - Exponential decay
   - Boost for new content

4. **Diversity** (10%)
   - Exploration bonus
   - Cross-category recommendations

## Video Pipeline

1. **Upload**
   - Client requests presigned S3 URL
   - Direct upload to S3 (client → S3)
   - Webhook triggers processing

2. **Processing**
   - AWS MediaConvert transcodes to HLS
   - Multiple quality levels (1080p, 720p, 480p)
   - Thumbnail generation
   - Metadata extraction

3. **Storage**
   - HLS segments stored in S3
   - CloudFront CDN distribution
   - Organized by video ID

4. **Delivery**
   - CDN serves adaptive bitrate stream
   - Player selects optimal quality
   - Watch time tracked in real-time

## Development Phases

### Phase 1: MVP (Weeks 1-6) ✅
- Core video upload & playback
- Vertical scroll feed
- Basic recommendations
- User authentication
- Like/dislike interactions

### Phase 2: Growth (Weeks 7-12) 🚧
- Premium subscriptions
- Star rating system
- Creator analytics
- Advanced recommendations
- Social features (comments, shares)

### Phase 3: Scale (Weeks 13-20) 📋
- Multi-region deployment
- Read replicas
- Advanced moderation AI
- Live streaming (optional)
- Creator fund program

## Performance Targets

- **Web Vitals**
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1

- **Mobile Performance**
  - Video load time < 2s
  - Smooth 60fps scrolling
  - < 50MB per 10 videos cached

- **API Response**
  - p50 < 100ms
  - p95 < 500ms
  - p99 < 1s

## Security Considerations

- Environment variables never committed
- API rate limiting (100 req/min)
- CORS properly configured
- SQL injection prevention (Prisma)
- XSS protection enabled
- CSRF tokens for forms
- Content Security Policy
- DDoS protection (Cloudflare)

## Cost Estimate (Monthly)

### Startup (1K MAU): ~$326
- Vercel: $20
- Database: $25
- Redis: $10
- AWS S3: $12
- CloudFront: $85
- MediaConvert: $120
- Clerk: $25
- Expo: $29

### Growth (10K MAU): ~$2,471
- Hosting: $20-60
- Database: $60
- Redis: $50
- AWS Storage: $115
- CDN: $850
- Transcoding: $1,200
- Services: $176

### Scale (100K MAU): ~$24,389
- Infrastructure: $1,400
- AWS: $21,650
- Services: $1,339

## Deployment

### Web
```bash
pnpm deploy:web
```
Deploys to Vercel with automatic CI/CD

### Mobile
```bash
cd apps/mobile
eas build --platform all
eas submit --platform all
```

## Monitoring

- **Errors**: Sentry
- **Analytics**: PostHog
- **Logs**: Axiom / CloudWatch
- **Uptime**: Better Uptime
- **Performance**: Vercel Analytics

## Support

- Email: support@raivstream.com
- Discord: discord.gg/raivstream
- GitHub Issues: github.com/yourusername/raivstream/issues

---

Built with ❤️ by the Raivstream team
