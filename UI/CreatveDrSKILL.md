---
name: creative-director
description: Use this skill before generating or redesigning any UI, frontend, landing page, app screen, dashboard, or visual design — whenever the user asks to "build," "design," "redesign," "make it look better/more premium," "refresh the UI," or start a new product surface, even without saying "creative director." Covers both from-scratch work and redesigns (attach or ask for screenshots of the current UI when redesigning — they are the baseline the audit and brief work from). Runs a short pre-production pass: installing extra design skills, pulling real visual references, auditing the current UI if one exists, and writing a brief — before any code gets generated, so the output has a point of view instead of looking like generic AI output. Especially worth invoking when there is a brand, a PRD, strong opinions on look-and-feel, or a complaint that a design looked generic or "AI-generated."
---

# Creative Director

Jumping straight from a one-line request to generated UI is how you get the same generic layout everyone else gets: centered hero, three feature cards, a gradient blob. This skill exists to slow that down by a few minutes — install some extra design tooling, look at real interfaces before inventing one, and write down what the thing is actually supposed to feel like — so whatever gets built afterward (by you directly, or by handing off to `frontend-design` / `web-artifacts-builder` / whatever builds the actual code) has somewhere to start from other than a blank page.

Think of this as pre-production, not the design itself. By the end of this skill you should have: extra design skills installed, a small folder of real reference points with notes on what's worth stealing from each, and a short brief. Handing all three of those to the actual build step is what makes the output distinctive.

## 1. Install the extra design skills

Run these before anything else, so their guidance is available for the build step:

```bash
npx skills add jakubkrehel/skills
npx skills add shadcn/ui
npx skills@latest add emilkowalski/skills
npx impeccable install
npx skills add https://github.com/Leonxlnx/taste-skill
/plugin marketplace add rshankras/claude-code-apple-skills
/plugin install apple-skills@indie-apple-stack
```

These are community-maintained skill packages — they pull from npm/GitHub, so they need network access, and each is arbitrary third-party code, worth a skim after install if you want to know exactly what you're relying on. What each one is for:

- **jakubkrehel/skills** and **shadcn/ui** — general component/spacing/type-system craft and shadcn/ui conventions.
- **emilkowalski/skills** — motion and animation specifically: reviewing, generating, and auditing animation (`animate`, `review-animations`, `improve-animations`), a web-adapted Apple design pass, Swift guidance, and UI-library selection. This is the one that carries most of step 4's "interactions and animations" half — lean on it hardest once the static layout is settled.
- **Impeccable** (`pbakaus/impeccable`) — installs via its own CLI, not `npx skills add`. Gives 24 `/impeccable <command>`s (`audit`, `polish`, `critique`, `distill`, `animate`, `colorize`, …) and 61 deterministic anti-pattern detectors (purple-to-blue gradients, gray text on color, bounce easing) that catch generic-AI-design tells without needing a model call. Its `/impeccable init` captures durable product context — audience, purpose, constraints, voice — into a `PRODUCT.md`; run that once per project, early, since it directly feeds the brief in step 3.
- **Taste** (`Leonxlnx/taste-skill`) — layout, typography, and motion judgment with three adjustable dials (design variance, motion intensity, visual density) and named style variants (soft, minimalist, brutalist, …). Use it to deliberately pick a point on those dials as part of the brief in step 3, rather than defaulting to the middle of all three by accident.
- **Apple HIG** (`rshankras/claude-code-apple-skills`) — a much larger library than the other four (160 skills across iOS/macOS/watchOS/visionOS development: generators, testing, App Store workflow, monetization, etc.), installed as a plugin rather than via `npx skills add`. The slice that matters here is its design category — Liquid Glass, HIG compliance, native animation and UX-writing conventions — so when this one's guidance conflicts with the web-oriented advice from the others, treat it as the source of truth specifically for anything that will render on an Apple platform (iOS/macOS/watchOS/visionOS), not for general web frontend work.

If any of these are already installed, or a command fails (no network, `npx` unavailable, a package renamed), don't block on it — note it and continue with what's available.

## 2. Pull real inspiration before inventing anything

Search for and look at actual interfaces, not just adjectives. Use whatever browsing/search tools are available in the session (web search, a browser tool, or ask the user for links/screenshots if nothing else is available). Three sources, each useful for something different:

- **Mobbin** — real, shipped product UI, screen by screen. Best for *patterns*: how a comparable product actually solved this exact screen (onboarding, empty states, settings, checkout).
- **Are.na** — curated visual moodboards made by people, not an algorithm. Best for *mood and juxtaposition*: the feeling a set of images creates together, often across disciplines (print, architecture, type) rather than just other apps.
- **Pinterest** — broad and fast. Best for *breadth*: quickly surveying a lot of visual territory for a color palette, a texture, an illustration style, before narrowing.

Search each with terms tied to the actual project — the industry, the mood, the specific component ("fintech onboarding dark mode," "playful pricing table," "SaaS empty state illustration") — not generic terms like "nice website." Pull somewhere around 5–10 references total across the three sources, and for each one write a line or two on what's actually worth taking from it (a color relationship, a transition, how dense the layout is, a type pairing) rather than just collecting links. The notes are what make this useful later — a pile of unannotated links doesn't help the build step any more than no references at all.

If the user already has strong reference points in mind (competitor apps, a Dribbble shot, "make it feel like Linear"), fold those in as part of this set instead of only searching fresh.

## 3. Write the brief

A design generated from a one-line prompt drifts generic because there's nothing specific enough to hold onto. A brief fixes that. If the user has a PRD or design doc already, read it for this — don't ask them to repeat what's already written down. Otherwise, pull together the short version yourself from the conversation, asking only for what's actually missing:

- What is this, and who's it for — in a sentence or two.
- Brand identity, if one exists: colors, fonts/type, logo, existing product screens, a tone description ("serious and clinical" vs. "playful and loud"). If there's truly no brand yet, say so explicitly rather than inventing one — a placeholder aesthetic chosen with intent beats a default one chosen by accident.
- The handful of must-have interactions or moments (a drag-to-reorder, a celebratory success state, a specific loading pattern) — the tweet-sized version of this skill's whole point is that motion and interaction are part of the design, not an afterthought bolted on once the layout is done.
- Anything pulled from step 2 that should directly inform this one: "the pricing table should feel like [reference]," "avoid the cluttered nav pattern in [reference]."

Keep this short — a few sentences to half a page. Its job is to be specific, not exhaustive.

## 4. Build with all three in hand

Now do the actual design/build work — either directly, or by handing off to whatever generates the code (a frontend/artifact skill, a component library, plain HTML/CSS/JS). Bring all three pieces from above into that step explicitly: the installed skills' conventions, the annotated references (cite which reference informed which decision when it's non-obvious), and the brief. Cover the same ground the brief called out — static layout, but also the interactions and animations (hover states, transitions, loading and empty states, micro-interactions) — since those are usually where "generic" versus "considered" actually shows up, and they're the easiest part to skip when moving fast.

## When redesigning something that already exists

Everything above assumes a blank canvas, but redesigns are just as common a reason to reach for this skill — and they change the starting point. Get screenshots of the current UI (ask for them if none were attached) before doing anything else; they're the concrete baseline for what's being changed, and they do more work than a description ever could — "the settings screen feels cluttered" means something different for every app.

Once you have them, use Impeccable's `/impeccable audit` and `/impeccable critique` commands (installed in step 1) directly against the current screens, before jumping to inspiration-gathering. Knowing specifically what's wrong — and, just as importantly, what's already working and shouldn't be thrown out — is a better starting point than a vague "make it better." Fold that audit into the brief in step 3 as three short lists: what to keep (patterns users already know, things that work), what's broken (from the critique), and what's changing on purpose (new direction, brand shift, a feature that outgrew its current UI). A brand identity already exists here by definition — the brief's job is deciding how much of it survives, not inventing one from scratch.

Step 2's inspiration-gathering still applies, but aim it at the specific problems the critique surfaced rather than searching generally — if the audit flags a cluttered settings screen, search for how comparable products solved *that* screen, not "good app design" broadly.

## When to move faster

Not every request needs the full pass — a quick internal tool or a one-off experiment doesn't need moodboard research. In that case, still ask the one question that matters most (is there a brand/identity to match, or a specific reference to aim for?) before generating anything, but skip the inspiration-gathering if the user is clearly optimizing for speed over distinctiveness. Say which parts you're skipping and why, so it's a visible tradeoff rather than a silently generic result.
