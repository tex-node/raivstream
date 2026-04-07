# Push Raivstream to GitHub

## Quick Start

1. **Create a new repository on GitHub**
   - Go to https://github.com/new
   - Repository name: `raivstream`
   - Description: "Premium short-form vertical video streaming platform"
   - Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license
   - Click "Create repository"

2. **Push the code**

```bash
cd /path/to/raivstream

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/raivstream.git

# Push to GitHub
git push -u origin main
```

## Repository Settings

### Secrets (for CI/CD)

Go to Settings → Secrets and variables → Actions, add:

```
VERCEL_TOKEN=your_vercel_token
VERCEL_ORG_ID=your_org_id
VERCEL_PROJECT_ID=your_project_id
EXPO_TOKEN=your_expo_token
DATABASE_URL=your_production_db_url
CLERK_SECRET_KEY=your_clerk_secret
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
STRIPE_SECRET_KEY=your_stripe_key
UPSTASH_REDIS_URL=your_redis_url
UPSTASH_REDIS_TOKEN=your_redis_token
```

### Branch Protection

Settings → Branches → Add rule for `main`:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging

## Next Steps After Upload

1. **Enable GitHub Actions**
   - Actions tab → "I understand my workflows, go ahead and enable them"

2. **Configure Vercel**
   - Import project from GitHub
   - Connect to `raivstream` repository
   - Framework: Next.js
   - Root Directory: `apps/web`
   - Add environment variables

3. **Setup Expo EAS**
   ```bash
   cd apps/mobile
   eas login
   eas init
   eas build:configure
   ```

4. **Update Project ID**
   - Edit `apps/mobile/app.json`
   - Update `extra.eas.projectId` with your Expo project ID

5. **Database Setup**
   ```bash
   # Production database (recommended: Supabase or Railway)
   pnpm db:migrate:deploy
   pnpm db:seed
   ```

## Project Structure Overview

```
raivstream/
├── apps/
│   ├── web/              # Next.js 15 web app
│   └── mobile/           # React Native + Expo mobile app
├── packages/
│   ├── database/         # Prisma schema
│   ├── api/              # tRPC API
│   └── jobs/             # Background jobs
├── docs/                 # Documentation
└── .github/workflows/    # CI/CD pipelines
```

## Important Files to Customize

1. **README.md**
   - Update repository URL
   - Add your contact info
   - Update badges

2. **.env.example**
   - Review all environment variables
   - Add any custom variables

3. **package.json**
   - Update repository URL
   - Update author information

4. **apps/mobile/app.json**
   - Update bundle identifiers
   - Update app name and slug

## Local Development

```bash
# Install dependencies
pnpm install

# Setup database
cp .env.example .env
# Edit .env with your credentials
pnpm db:push
pnpm db:seed

# Start development
pnpm dev
```

## Deployment Checklist

- [ ] Environment variables configured in Vercel
- [ ] Database migrations run
- [ ] Clerk webhooks configured
- [ ] Stripe webhooks configured
- [ ] AWS S3 bucket created
- [ ] CloudFront distribution setup
- [ ] Sentry project created
- [ ] PostHog project created
- [ ] Expo project created

## Support

Need help? Check:
- 📖 [Setup Guide](./docs/SETUP.md)
- 📋 [Project Summary](./PROJECT_SUMMARY.md)
- 🤝 [Contributing Guide](./CONTRIBUTING.md)

---

Good luck with your project! 🚀
