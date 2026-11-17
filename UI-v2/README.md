# Raivstream UI v2

The Apple-style dark redesign of Raivstream, built as a working React app.
It sits next to the original `UI` folder, which is untouched.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` type-checks and writes the production site to `dist/`.

To serve it under a sub-path (like the current `https://app.raivstream.com/ui/`), build with
`npx vite build --base=/ui/` — routing picks the base up automatically.

## Screens and routes

| Route | Screen |
|---|---|
| `/` | Welcome / sign-in (Watch or Create) |
| `/watch` | Vertical video feed |
| `/create` | Creator home — one prompt bar, continue projects |
| `/project/:id/story` | Story — tap a paragraph for AI actions |
| `/project/:id/cast` | Cast — portraits + character detail |
| `/project/:id/scenes` | Scene Director — generate, keep or redo |
| `/library` | Films, scenes, characters |
| `/kids` | R16 Kids (own layout, parent lock) |
| `/insights` | Creator analytics |
| `/credits` | Balance and top-up packs |
| `/settings` | Profile and settings |
| `/admin` | Moderation review queue |

Every screen is one file in `src/screens/` and works at phone and desktop widths
(Tailwind `md:` breakpoint = 768px). Below that you get the mobile layout with the floating tab bar;
above it, the Mac-style sidebar.

## Where things live

- `src/styles/index.css` — all design tokens (colours, fonts, the brand gradient) and the placeholder image styles.
- `src/components/ui.tsx` — buttons, segmented control, grouped lists, toggle, avatar, stills.
- `src/components/Shell.tsx` — sidebar (desktop) and tab bar (mobile).
- `src/components/ProjectFrame.tsx` — header + action bar shared by Story, Cast and Scenes.
- `src/lib/data.ts` — **all mock data**. Swap each export for a Supabase query when wiring the backend.

## Design rules this follows

- One main action per screen. The pink-to-cyan gradient is only for that action, progress bars and selection rings.
- Settings-style grouped lists instead of rows of buttons; options cycle on tap instead of exposing every choice.
- Touch targets are at least 44px.

## Still to wire up (search the code for `TODO`)

- Sign-in (Apple + email) on the Welcome screen.
- Story generation from the Create prompt.
- Paragraph rewrite actions on the Story screen.
- Real scene generation job in `Director.tsx` (`useGeneration` — the status labels are the intended copy).
- Payment checkout on Credits; prices show as `[PRICE]`.
- Parent password / Face ID to leave R16 Kids.
- Moderation API on Admin.
- Real video in Watch (replace the `Still` with a `<video>` element) and real images for every `still-*` / `portrait-*` / `kids-*` placeholder.
