# Raivstream Setup Guide

Complete guide to setting up and running Raivstream locally and in production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Database Setup](#database-setup)
4. [AWS Configuration](#aws-configuration)
5. [Third-Party Services](#third-party-services)
6. [Running the Application](#running-the-application)
7. [Deployment](#deployment)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **pnpm** 8+ (Install: `npm install -g pnpm`)
- **Git** ([Download](https://git-scm.com/))
- **PostgreSQL** 16+ ([Download](https://www.postgresql.org/download/))
- **Redis** (Optional for local, required for production)

### Required Accounts

- [Clerk](https://clerk.com/) - Authentication
- [AWS](https://aws.amazon.com/) - Video storage & processing
- [Stripe](https://stripe.com/) - Payments
- [Vercel](https://vercel.com/) - Web hosting (optional)
- [Expo](https://expo.dev/) - Mobile app development

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/raivstream.git
cd raivstream
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see sections below for each service).

## Database Setup

### Local PostgreSQL

#### Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Database will be available at:
# postgresql://raivstream:raivstream@localhost:5432/raivstream
```

#### Manual Installation

1. Install PostgreSQL 16
2. Create a database:

```sql
CREATE DATABASE raivstream;
CREATE USER raivstream WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE raivstream TO raivstream;
```

3. Update `DATABASE_URL` in `.env`:

```env
DATABASE_URL="postgresql://raivstream:your_password@localhost:5432/raivstream"
```

### Run Migrations

```bash
# Generate Prisma Client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed database with initial data
pnpm db:seed
```

### Prisma Studio (Database GUI)

```bash
pnpm db:studio
# Opens at http://localhost:5555
```

## AWS Configuration

### 1. Create AWS Account

Sign up at [aws.amazon.com](https://aws.amazon.com)

### 2. Create IAM User

1. Go to IAM Console
2. Create user with programmatic access
3. Attach policies:
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `AWSElementalMediaConvertFullAccess`

4. Save credentials to `.env`:

```env
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
```

### 3. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://raivstream-videos --region us-east-1

# Enable CORS
aws s3api put-bucket-cors --bucket raivstream-videos --cors-configuration file://cors.json
```

`cors.json`:
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": []
    }
  ]
}
```

Update `.env`:
```env
S3_BUCKET_NAME="raivstream-videos"
```

### 4. Setup CloudFront

1. Create CloudFront distribution
2. Set origin to your S3 bucket
3. Update `.env`:

```env
CLOUDFRONT_DOMAIN="d1234567890.cloudfront.net"
```

### 5. Setup MediaConvert

1. Get MediaConvert endpoint:

```bash
aws mediaconvert describe-endpoints --region us-east-1
```

2. Create IAM role for MediaConvert
3. Update `.env`:

```env
AWS_MEDIACONVERT_ENDPOINT="https://abc123.mediaconvert.us-east-1.amazonaws.com"
AWS_MEDIACONVERT_ROLE="arn:aws:iam::123456789:role/MediaConvertRole"
```

## Third-Party Services

### Clerk (Authentication)

1. Sign up at [clerk.com](https://clerk.com)
2. Create application
3. Get API keys from dashboard
4. Update `.env`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

5. Configure webhooks:
   - URL: `https://your-domain.com/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`

### Stripe (Payments)

1. Sign up at [stripe.com](https://stripe.com)
2. Get API keys
3. Create products & prices for subscription tiers
4. Update `.env`:

```env
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_VIEWER_PREMIUM_PRICE_ID="price_..."
STRIPE_CREATOR_PREMIUM_PRICE_ID="price_..."
STRIPE_ULTIMATE_PRICE_ID="price_..."
```

5. Configure webhook:
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`

### Upstash (Redis)

1. Sign up at [upstash.com](https://upstash.com)
2. Create Redis database
3. Update `.env`:

```env
UPSTASH_REDIS_URL="https://..."
UPSTASH_REDIS_TOKEN="..."
```

### Inngest (Background Jobs)

1. Sign up at [inngest.com](https://inngest.com)
2. Create workspace
3. Update `.env`:

```env
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."
```

### Sentry (Error Tracking)

1. Sign up at [sentry.io](https://sentry.io)
2. Create project
3. Update `.env`:

```env
SENTRY_DSN="https://...@sentry.io/..."
NEXT_PUBLIC_SENTRY_DSN="https://...@sentry.io/..."
```

### PostHog (Analytics)

1. Sign up at [posthog.com](https://posthog.com)
2. Create project
3. Update `.env`:

```env
NEXT_PUBLIC_POSTHOG_KEY="phc_..."
NEXT_PUBLIC_POSTHOG_HOST="https://app.posthog.com"
```

## Running the Application

### Development Mode

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm dev --filter=web      # Web only
pnpm dev --filter=mobile   # Mobile only
```

### Web App

```bash
cd apps/web
pnpm dev
# Opens at http://localhost:3000
```

### Mobile App

```bash
cd apps/mobile
npx expo start

# Then choose:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Scan QR code with Expo Go app
```

### Production Build

```bash
# Web
pnpm build --filter=web

# Mobile
cd apps/mobile
eas build --platform all
```

## Deployment

### Web (Vercel)

#### Option 1: Automatic (GitHub Integration)

1. Connect GitHub repo to Vercel
2. Configure environment variables
3. Deploy automatically on push to main

#### Option 2: Manual

```bash
cd apps/web
vercel --prod
```

### Mobile (Expo EAS)

#### iOS

```bash
cd apps/mobile

# Build
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android

```bash
# Build
eas build --platform android --profile production

# Submit to Google Play
eas submit --platform android
```

### Database Migrations (Production)

```bash
# Run migrations
pnpm db:migrate:deploy

# Verify
psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations;"
```

## Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check credentials
psql $DATABASE_URL
```

#### Prisma Client Not Generated

```bash
pnpm db:generate
```

#### Module Not Found

```bash
# Clean install
rm -rf node_modules
pnpm install
```

#### Expo Build Fails

```bash
# Clear cache
expo start -c

# Update Expo
npm install -g expo-cli@latest
```

### Getting Help

- 📧 Email: support@raivstream.com
- 💬 Discord: [Join community](https://discord.gg/raivstream)
- 🐛 GitHub Issues: [Report bugs](https://github.com/yourusername/raivstream/issues)

## Next Steps

- Read [Architecture Documentation](./architecture.md)
- Review [API Documentation](./api.md)
- Check [Contributing Guide](../CONTRIBUTING.md)
- Explore [Code Examples](./examples/)

---

Happy coding! 🚀
