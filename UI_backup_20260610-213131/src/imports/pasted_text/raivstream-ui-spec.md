Design a complete modern UI system and screen set for Raivstream, a short-form vertical video platform with AI generation, Story Studio, admin tools, payments, and a kids-safe R16 subdomain.

The product has two experiences:
1. Main Raivstream app: short-form video feed, AI Studio, Story Studio, uploads, creator tools, subscriptions, credits, and admin.
2. R16 Kids app: same platform but simplified, kids-safe, restricted navigation, only approved child-safe content.

Design Goals:
- Build a polished production-ready interface, not a landing page.
- Prioritize creator workflows, media browsing, AI generation, and admin operations.
- Make the app feel like a premium video creation platform, not a generic social app.
- Use a responsive design system for desktop and mobile web.
- Keep UI dense enough for repeated work, especially admin and creator tools.
- Avoid oversized marketing hero sections.
- Avoid decorative blobs, orbs, excessive gradients, and one-color palettes.
- Use clean typography, strong media previews, clear hierarchy, and reusable components.
- Cards should use subtle 8px radius or less unless modals need slightly more.
- Use realistic image/video placeholders and thumbnail states.

Core Navigation:
- Home Feed
- Search
- Upload
- AI Studio
- Story Studio
- Credits
- Pricing
- Analytics
- Settings
- Admin
- Profile
- Sign In / Sign Up
- R16 Kids Home

Design System Requirements:
Create a full design system with:
- Color tokens for main app, R16 kids mode, success, warning, danger, muted, borders, surfaces, overlays
- Typography scale
- Spacing scale
- Button variants: primary, secondary, ghost, danger, icon-only
- Form controls: input, textarea, select, segmented control, checkbox, toggle, slider
- Tabs
- Dropdown menus
- Modals
- Toasts
- Empty states
- Loading states
- Error states
- Badges and status pills
- Credit/cost pill
- Media thumbnail component
- Video preview component
- User avatar component
- Admin table component
- Mobile bottom nav
- Desktop sidebar/top nav
- R16 kids-safe visual variant

Main Screens To Generate:

1. Public Vertical Feed
- Full-screen TikTok-style video feed
- Video or AI image content centered
- Creator info, title, description, tags
- Like, dislike, star rating, share, follow controls
- Feed tabs: For You, Trending, Viewers Pick, Following
- Guest CTA for Sign up / Sign in
- Premium lock overlay for gated content
- Landscape media fallback with blurred backdrop
- Broken/missing thumbnail fallback state

2. R16 Kids Feed
- Same feed structure but child-safe branding
- “R16 Kids” nav branding
- No Upload, AI Studio, Credits, Pricing, Analytics, Settings, or Admin links
- Static “Kids Feed” tab
- Gentle but not childish visual style
- Clear approved/kids-safe indicators

3. AI Studio
- Image / Video segmented mode switch
- Model dropdown with icon, model name, status badge, credit cost
- Prompt textarea with character counter
- Negative prompt textarea
- Aspect ratio selector
- Duration selector for video
- Seed image URL/input area for image-to-video models
- Generate button with credit cost
- Job progress state: queued, generating, completed, failed
- Output preview panel
- Publish to feed action
- Save to storyboard action
- Insufficient credits state
- Moderation rejection state

4. Story Studio
- Project list and project detail views
- Story text editor
- Character builder panel
- Environment designer panel
- Story breakdown into storyboard shots
- Shot list with shot type, scene, camera, action, image prompt, video prompt
- Character and environment references attached to shots
- Button to send prompt to AI Studio
- Asset slots for generated image/video references
- Long story volume/chapter handling
- Empty project state

5. Upload Flow
- File upload dropzone
- Upload progress
- Metadata form: title, description, tags, categories
- Thumbnail selection/upload
- Premium-only toggle
- Kids-safe/content rating fields
- Publish action
- Processing state

6. Creator Profile / Media Library
- Creator header with avatar, username, display name, stats, follow button
- Grid of videos/images
- Thumbnail fallback states
- Video preview fallback when thumbnail is missing
- Empty media state
- Tabs for videos, AI generations, liked/saved if appropriate

7. Analytics Dashboard
- Creator stats: views, followers, engagement, watch hours
- Top videos table/grid
- Revenue/credits summary
- Time range selector
- Chart components
- Empty analytics state

8. Credits Page
- Credit balance
- Credit packages: 1,000, 5,000, 10,000 credits
- Paystack checkout action
- Credit history table
- Usage/refund/purchase ledger states

9. Pricing Page
- Viewer subscription in NGN
- Creator plan
- Credit package upsells
- Clear comparison between Free, Viewer, Creator

10. Admin Overview
- Stats cards: users, videos, generation jobs, revenue, credits in circulation
- Model usage chart
- Moderation queue summary
- Recent jobs table

11. Admin Users
- User table with search/filter
- Role selector
- Premium tier selector
- Credit balance
- Ban/unban action
- Adjust credits action

12. Admin Credits
- Two tabs:
  - Feature Rates
  - Manual Credits / Coupons
- Feature rates table with edit state
- Manual credit form:
  - User email/username/id
  - Action: Gift/Coupon, Refund, Deduct
  - Credit amount
  - Reason
  - Coupon/reference ID
  - Result state showing before/after balance
- Ledger behavior sidebar

13. Admin Moderation
- Queue of pending/flagged videos
- Media preview
- Creator info
- Moderation flags
- Actions: approve, reject, flag
- Content rating selector
- Kids-safe toggle
- Reason field

14. Admin Generation Jobs
- Jobs table
- Filters by status/model
- Job detail drawer
- Prompt preview
- Provider job ID
- Output URL
- Credits used
- Retry/cancel states where applicable

15. Auth Screens
- Sign in
- Sign up
- Forgot password
- Reset password
- Password strength indicator
- Reveal password control

Blank Templates For Future Features:
Create reusable blank page templates that match the system:

1. Blank Dashboard Template
- Header with title, subtitle, primary action
- Stats row
- Content area
- Empty state
- Loading state

2. Blank CRUD Management Template
- Search/filter bar
- Table
- Add/edit modal
- Delete confirmation modal
- Pagination
- Empty state

3. Blank Creator Tool Template
- Left configuration panel
- Main preview/work area
- Right inspector panel
- Save/generate/publish actions

4. Blank Media Library Template
- Toolbar with filters
- Responsive media grid
- Thumbnail/video/image states
- Bulk actions
- Empty upload prompt

5. Blank Workflow/Wizard Template
- Stepper
- Form content
- Back/next buttons
- Review step
- Success state

6. Blank Admin Settings Template
- Sectioned settings layout
- Toggles, selects, text inputs
- Save/cancel bar
- Audit log area

7. Blank Detail Page Template
- Entity header
- Metadata sidebar
- Activity/history area
- Related items grid
- Primary/secondary actions

8. Blank Mobile Screen Template
- Mobile header
- Content area
- Bottom navigation
- Floating primary action
- Empty/loading/error states

Output Requirements:
- Generate high-fidelity Figma frames for desktop and mobile.
- Include component variants and reusable templates.
- Use realistic placeholder content for Raivstream.
- Use image/video thumbnails in feed and media grids.
- Include dark-mode-first styling, with a lighter surface variant where useful.
- Show the main app and R16 Kids app as related but clearly distinct.
- Name all frames and components clearly.