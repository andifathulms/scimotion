# Scimotion

**Science you can see move.** An interactive science blog where every article pairs a clear written explanation with a live, controllable animation — so readers don't just read about a concept, they watch it move and play with it.

→ [scimotion.vercel.app](https://scimotion.vercel.app)

## What it is

Science writing has a gap: equations and diagrams sit flat on the page, but the concepts they represent are dynamic. Scimotion closes that gap. Each article builds a concept from first principles, then hands the reader the controls — drag a slider, change a parameter, and watch the math respond in real time.

- **15 articles** across Mathematics, Physics, Computer Science, and Medicine
- **18 hand-coded animation components** — canvas simulations (Brownian motion, pendulum, double-slit), SVG step-through visualizers (binary search, Euler's formula), and statistical widgets (Central Limit Theorem)
- **Scroll-triggered autoplay** via Intersection Observer, with user play/pause/reset and `prefers-reduced-motion` support
- **KaTeX math** rendered server-side, **dark/light theming**, and a reading-progress bar

## Tech stack

| Layer | Stack |
|---|---|
| Framework | Next.js 16 (App Router, RSC) |
| UI | React 19, Tailwind CSS v4 |
| Content | MDX (`@next/mdx`, `next-mdx-remote`) with `gray-matter` frontmatter |
| Math | `remark-math` + `rehype-katex` + KaTeX |
| Motion | Framer Motion (UI chrome only); science widgets are raw canvas / SVG / `requestAnimationFrame` |
| Theming | `next-themes` |
| Language | TypeScript |

Articles are `.mdx` files read at build time, so the entire site is statically generated with no database. Animation logic for the science widgets is written by hand — Framer Motion is used only for UI polish (card hover, entrance staggers), keeping the bundle predictable and rendering deterministic.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Project structure

```
app/                  App Router pages (home, article, about, search)
  articles/[slug]/    Dynamic article route (MDX render + metadata)
  sitemap.ts          Generated sitemap
  robots.ts           Robots directives
components/
  animations/         18 self-contained interactive widgets
  *.tsx               Shared UI (Navbar, Hero, cards, share, etc.)
content/articles/     15 .mdx articles with YAML frontmatter
lib/                  articles.ts (content data layer), site.ts (config)
hooks/                useAnimationTrigger (Intersection Observer)
styles/               globals.css (Tailwind v4 + design tokens)
```

## Adding an article

1. Create `content/articles/<slug>.mdx` with frontmatter (`title`, `subtitle`, `topic`, `slug`, `date`, `readTime`, `featured`, `description`).
2. Write the prose; embed an animation component inline, e.g. `<PendulumAnimation />`.
3. If it's a new widget, add it under `components/animations/` and register it in `components/ArticleAnimations.tsx`.

## Configuration

Set `NEXT_PUBLIC_SITE_URL` in your environment to control canonical URLs, sitemap, and share links (defaults to the production URL).

## Deployment

Zero-config on [Vercel](https://vercel.com) — `next build` and deploy.
