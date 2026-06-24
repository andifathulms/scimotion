# Scimotion — Portfolio Context

> Raw material for a client-facing portfolio case study. Factual, codebase-derived.

---

## 1. One-Line Summary

An interactive science blog where every article pairs clear written explanation with a live, controllable animation — so readers don't just read about a concept, they watch it move and play with it.

---

## 2. The Problem

Science writing has a gap: equations and diagrams sit flat on the page, but the concepts they represent are dynamic. A reader can memorize the Fourier transform formula without ever grasping *why* decomposing a signal works. Existing science media either goes too shallow (pop-sci videos) or too deep (academic papers with no visuals). Scimotion targets curious non-specialists — students, self-learners, professionals from adjacent fields — who want real conceptual depth and the ability to manipulate the thing they're trying to understand.

---

## 3. My Role

Built entirely from scratch. The PRD defined product intent; every line of code — scaffolding, routing, design system, animation components, MDX pipeline, Framer Motion integration, and all 15 articles — was written by me. No inherited codebase, no starter template beyond `create-next-app`.

Notable scope I added beyond the original PRD spec:
- Expanded article count from 5 (spec) to 15 (shipped), spanning all four topic areas
- Added Framer Motion for card spring hover, stagger entrance animations on the homepage hero, and scroll-triggered prose entrance effects — not in the original spec
- Built 18 animation components (spec called for 5), including extras like `SortingComplexityAnimation`, `FourierPhasesAnimation`, `SievePrimeGapAnimation` — secondary widgets embedded within single articles
- Pivoted the color palette mid-build from a cold navy scheme to a warmer dark theme (evidenced by commits `4d048bd` → `576d360`)

---

## 4. Technical Approach

**MDX as the content layer.** Articles are `.mdx` files with YAML frontmatter. The data layer (`lib/articles.ts`) reads frontmatter at build time using `gray-matter`, enabling fully static article listing with zero database. Article bodies are rendered server-side via `next-mdx-remote` with math plugins (`remark-math` + `rehype-katex`) piped in, so KaTeX equations render without client JS.

**One animation component per article (or more).** Every interactive widget is a self-contained React client component under `components/animations/`. They share zero global state — each manages its own play/pause/reset lifecycle. This makes them easy to add, test, and isolate. A shared `useAnimationTrigger` hook (Intersection Observer) fires each animation when the user scrolls 30% into the viewport, so nothing runs off-screen.

**Static-first with selective client components.** Pages are server components by default (Next.js App Router). Only animation blocks, the reading progress bar, theme toggle, and Framer Motion wrappers are `'use client'`. This keeps the initial HTML payload lean and fully indexable.

**No animation library for the science widgets.** All animation logic (canvas drawing, SVG path updates, requestAnimationFrame loops) is hand-written. Framer Motion is used only for UI chrome (card entrances, hover springs) — not for the interactive science visualizations. This was a deliberate constraint from the PRD to keep bundle size predictable and rendering deterministic.

---

## 5. Actual Tech Stack

Verified from `package.json` — only what's really installed:

| Layer | Package | Version |
|---|---|---|
| Framework | `next` | 16.2.9 |
| UI runtime | `react` / `react-dom` | 19.2.4 |
| MDX pipeline | `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react` | ^3.x / ^16.x |
| Remote MDX render | `next-mdx-remote` | ^6.0.0 |
| Frontmatter parsing | `gray-matter` | ^4.0.3 |
| Math rendering | `remark-math`, `rehype-katex`, `katex` | ^6 / ^7 / ^0.17 |
| Motion / animation | `framer-motion` | ^12.40.0 |
| Theming | `next-themes` | ^0.4.6 |
| Icons | `lucide-react` | ^1.20.0 |
| Styling | `tailwindcss` v4, `postcss`, `autoprefixer` | ^4 |
| Language | TypeScript | ^5 |
| Deployment target | Vercel (zero-config `next build`) | — |

---

## 6. Notable Features

- **15 interactive articles** across Mathematics, Physics, Computer Science, and Medicine — each with custom-built animated widgets, prose, and KaTeX-rendered equations
- **18 animation components** hand-coded without an animation library: canvas-based simulations (Brownian motion, pendulum, double-slit), SVG step-through visualizers (binary search, Euler's formula), and histogram widgets (Central Limit Theorem)
- **Scroll-triggered autoplay** via Intersection Observer — animations activate when 30% of the component enters the viewport, with user-controlled play/pause/reset and speed sliders
- **Framer Motion UI layer** — homepage hero dot-grid canvas, card spring-hover effects, and stagger entrance animations for article prose sections
- **Dark/light theme** with a warm custom palette (not Tailwind defaults), implemented via CSS variables and `next-themes`; dark is the default
- **Reading progress bar** fixed above the navbar on article pages, plus a social share system (Twitter/X intent URL + clipboard copy with toast feedback)

---

## 7. Challenges and Tradeoffs

**Palette pivot mid-build.** The original design used a cold navy dark scheme. After implementing it across all components, the visual result felt sterile for science content. Commits `4d048bd` and `576d360` show a full token migration to a warmer dark palette — requiring touches across every shared component, not just the config.

**Animation scope creep (intentional).** The PRD specified one animation per article. In practice, several articles warranted a second widget (e.g., the Sieve article has `SievePrimeGapAnimation` alongside the main `SieveAnimation`; Sorting has both a step-through visualizer and a complexity chart). This was a deliberate UX choice — a single long animation can leave readers with questions that a focused secondary widget answers.

**MDX + React 19 + Next 16 compatibility.** Using cutting-edge versions of all three simultaneously required careful wiring in `next.config.mjs` (MDX plugin config) and deliberate `'use client'` boundaries. The final build cleanup (`feat(phase7): remove stale app/globals.css`) reflects that CSS loading order had to be reconciled after Tailwind v4's PostCSS pipeline was added.

**No animation library for science widgets.** Keeping all visualization logic in raw canvas/SVG/requestAnimationFrame means more code per component, but gives full control over rendering and avoids dependency on a library's abstraction model when simulating physics or stepping through algorithms.

---

## 8. Status

- **Development:** Complete — 38 commits, all 15 articles published, all animation components functional
- **Deployment:** Configured for Vercel (`next build`, zero-config); deployment status not confirmed in the repo (no Vercel project ID or `.vercel/` directory present)
- **Repository:** Private (based on `package.json` `"private": true`)
- **Stage:** Functional prototype / portfolio-ready MVP

---

## 9. Metrics

| Metric | Value |
|---|---|
| Total commits | 38 |
| Active development span | 2026-06-18 → 2026-06-21 (4 days) |
| Articles | 15 MDX files |
| Animation components | 18 React components |
| Source lines (TS/TSX/MDX) | ~6,300 |
| App routes | 4 (homepage, `/articles/[slug]`, `/about`, `/search`) |
| Topic areas covered | 4 (Mathematics, Physics, Computer Science, Medicine) |

---

## 10. Suggested Screenshots

| # | What to capture | Relevant component(s) |
|---|---|---|
| 1 | **Homepage — full magazine grid** with topic filter pills active (e.g., "Mathematics" selected), showing the featured card + multi-column layout and card hover state | [app/page.tsx](app/page.tsx), [components/HomepageGrid.tsx](components/HomepageGrid.tsx), [components/ArticleCard.tsx](components/ArticleCard.tsx) |
| 2 | **Article page mid-scroll** on the Sieve of Eratosthenes — showing the reading progress bar, a prose section with a KaTeX formula visible, and the `SieveAnimation` widget with numbers being crossed out | [app/articles/[slug]/page.tsx](app/articles/%5Bslug%5D/page.tsx), [components/animations/SieveAnimation.tsx](components/animations/SieveAnimation.tsx) |
| 3 | **Sorting algorithms animation** mid-sort — bars at different heights highlighted in amber (comparing) vs blue (sorted), with the live comparison/swap counter visible and the algorithm dropdown open | [components/animations/SortingAnimation.tsx](components/animations/SortingAnimation.tsx) |
| 4 | **Dark vs light mode side-by-side** on the homepage or an article card — illustrates the warm palette design system and the theme toggle working | [components/ThemeToggle.tsx](components/ThemeToggle.tsx), [components/Navbar.tsx](components/Navbar.tsx) |
