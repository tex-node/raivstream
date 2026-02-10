# Raivstream

> Premium short-form vertical video streaming platform - A fusion of TikTok's engaging UGC feed and Netflix's premium subscription model.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

## 🎯 Overview

Raivstream is a modern, scalable video streaming platform that combines:
- **TikTok-style infinite vertical scrolling** for immersive content discovery
- **Netflix-quality recommendations** powered by advanced algorithms
- **Premium subscription model** with creator monetization
- **Cross-platform support** (iOS, Android, Web)

## ✨ Key Features

### For Viewers
- 📱 Infinite vertical video feed (For You, Following, Trending)
- ⭐ Multi-dimensional engagement (Like, Dislike, 1-5 Star ratings)
- 🎯 Personalized recommendations based on watch history
- 💎 Premium tiers with ad-free experience & exclusive content
- 📥 Offline downloads (Premium)
- 🔍 Advanced search and discovery

### For Creators
- 📹 Easy video upload (15-60 seconds, 9:16 format)
- 📊 Advanced analytics dashboard
- 🏆 Badges and featured placement
- 💰 Revenue sharing program
- 🚀 Boosted visibility for premium creators
- ✅ Verification system

## 🏗️ Architecture

This is a monorepo using **Turborepo** with the following structure:

```
raivstream/
├── apps/
│   ├── web/              # Next.js 15 web application
│   └── mobile/           # React Native + Expo mobile app
├── packages/
│   ├── database/         # Prisma schema & migrations
│   ├── api/              # tRPC API routes
│   ├── jobs/             # Inngest background jobs
│   ├── ui/               # Shared UI components
│   └── config/           # Shared configurations
└── infrastructure/       # IaC and deployment configs
```

## 🛠️ Tech Stack

### Frontend
- **Web**: Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS
- **Mobile**: React Native 0.73+, Expo SDK 50+, React Navigation

### Backend
- **API**: tRPC for type-safe APIs
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache**: Redis (Upstash)
- **Auth**: Clerk
- **Payments**: Stripe

### Video Infrastructure
- **Storage**: AWS S3 / Cloudflare R2
- **CDN**: CloudFront / Cloudflare
- **Transcoding**: AWS MediaConvert
- **Streaming**: HLS adaptive bitrate

### DevOps
- **Hosting**: Vercel (web), Expo EAS (mobile)
- **Background Jobs**: Inngest
- **Monitoring**: Sentry, PostHog
- **CI/CD**: GitHub Actions

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- PostgreSQL 16
- Redis
- AWS account (for video infrastructure)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/raivstream.git
cd raivstream

# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Setup database
pnpm db:push
pnpm db:seed

# Start development
pnpm dev
```

### Development Commands

```bash
# Run all apps in development
pnpm dev

# Run specific app
pnpm dev --filter=web
pnpm dev --filter=mobile

# Build for production
pnpm build

# Run tests
pnpm test

# Database commands
pnpm db:studio          # Open Prisma Studio
pnpm db:migrate         # Create migration
pnpm db:push            # Push schema changes

# Linting and formatting
pnpm lint
pnpm format
```

## 📱 Mobile Development

```bash
cd apps/mobile

# Install dependencies
pnpm install

# Start Expo
npx expo start

# Run on iOS
npx expo run:ios

# Run on Android
npx expo run:android

# Build for production
eas build --platform ios
eas build --platform android
```

## 🌐 Web Development

```bash
cd apps/web

# Development
pnpm dev

# Build
pnpm build

# Start production server
pnpm start
```

## 📊 Database Management

```bash
# Generate Prisma Client
pnpm db:generate

# Create a new migration
pnpm db:migrate

# Push schema without migration (dev only)
pnpm db:push

# Open Prisma Studio
pnpm db:studio

# Seed database
pnpm db:seed
```

## 🔐 Environment Variables

See `.env.example` for all required environment variables. Key services:

- **Database**: `DATABASE_URL`
- **Auth**: Clerk keys
- **AWS**: S3, CloudFront, MediaConvert credentials
- **Stripe**: Payment processing keys
- **Redis**: Upstash URL and token
- **Monitoring**: Sentry DSN, PostHog key

## 📈 Deployment

### Web (Vercel)
```bash
pnpm deploy:web
```

### Mobile (Expo EAS)
```bash
cd apps/mobile
eas build --platform all
eas submit --platform all
```

### Database Migrations
```bash
# Production migration
pnpm db:migrate deploy
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e
```

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Documentation](./docs/api.md)
- [Database Schema](./packages/database/README.md)
- [Deployment Guide](./docs/deployment.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 🎯 Roadmap

### Phase 1: MVP (Weeks 1-6) ✅
- [x] Core video upload & playback
- [x] Vertical scroll feed
- [x] Basic recommendations
- [x] User authentication

### Phase 2: Growth Features (Weeks 7-12) 🚧
- [ ] Premium subscriptions
- [ ] Creator analytics
- [ ] Advanced recommendations
- [ ] Social features (comments, shares)

### Phase 3: Scale & Optimize (Weeks 13-20) 📋
- [ ] Multi-region deployment
- [ ] Advanced moderation AI
- [ ] Live streaming
- [ ] Creator fund program

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/)
- [React Native](https://reactnative.dev/)
- [Expo](https://expo.dev/)
- [Prisma](https://www.prisma.io/)
- [tRPC](https://trpc.io/)
- [Clerk](https://clerk.com/)
- [Stripe](https://stripe.com/)

## 📞 Support

- 📧 Email: support@raivstream.com
- 💬 Discord: [Join our community](https://discord.gg/raivstream)
- 🐦 Twitter: [@raivstream](https://twitter.com/raivstream)

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/yourusername/raivstream)
![GitHub forks](https://img.shields.io/github/forks/yourusername/raivstream)
![GitHub issues](https://img.shields.io/github/issues/yourusername/raivstream)

---

Made with ❤️ by the Raivstream team
