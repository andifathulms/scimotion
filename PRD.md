# Scimotion — Product Requirements Document

## 1. Overview

**Scimotion** is a dark-mode-first science blog where every article explains a concept clearly in prose, then brings it to life with an interactive animation. The tagline is: _"Science you can see move."_

The core value proposition: readers don't just read about a concept — they interact with it. Every post has sliders, play/pause controls, and live visual feedback embedded directly inside the article body.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Content | MDX (local files in `/content/articles/`) |
| Styling | Tailwind CSS v3 |
| Animation | Custom React components per article (no animation library) |
| Math rendering | KaTeX via `rehype-katex` + `remark-math` |
| MDX pipeline | `@next/mdx` + `next-mdx-remote` |
| Icons | Lucide React |
| Theme | `next-themes` for dark/light toggle |
| Fonts | Inter (sans-serif) via `next/font/google` |
| Deployment | Vercel (zero-config, `next build`) |

---

## 3. Pages & Routes

### 3.1 Homepage — `/`
- Sticky top navbar with logo, nav links, theme toggle, and search icon
- Hero section: large display heading "Science you can see move." + one-line subtitle
- Topic filter pills: All · Mathematics · Physics · Computer Science · Medicine
- Magazine grid layout:
  - First card: full-width featured article (large thumbnail + title + description)
  - Second row: 2-column split
  - Third row onwards: 3-column grid
- Each card shows: topic badge, title, description (2 lines max), estimated read time, animated "Interactive" badge
- Filter pills filter cards client-side with no page reload

### 3.2 Article Page — `/articles/[slug]`
- Thin reading progress bar fixed at the very top of the viewport (blue, fills left-to-right as user scrolls)
- Sticky navbar remains visible while scrolling
- Article layout: centered single column, max-width 680px, generous padding
- Article header: topic badge → title → subtitle → meta row (read time · date · author)
- Body: prose sections interleaved with animation components
- Animation blocks: visually distinct from prose — dark surface card (`bg-surface`), play/reset controls, slider inputs, live readout labels. Auto-play when scrolled 30% into the viewport; user can reset and replay.
- KaTeX math inline and block rendering
- Article footer (after body):
  - Horizontal divider
  - Share section: "Share this article" + Twitter/X and copy-link buttons
  - Related posts: heading "You might also like" + 3 cards in a row (same card component as homepage)

### 3.3 About Page — `/about`
- Simple single-column layout
- Heading + 3–4 paragraphs about the mission of Scimotion
- A "What we cover" section with 4 topic cards (Math, Physics, CS, Medicine) each with a short description
- CTA at bottom: "Start reading →" linking back to homepage

---

## 4. Navigation

```
Logo (left)     |     Explore · Topics · About (center)     |     [search icon] [theme toggle] (right)
```

- Logo: small square mark + "Scimotion" wordmark
- Logo mark: 22×22px rounded square, blue (`#1E6FD9`), with a small white circle inside
- On mobile: hamburger menu replaces center links; everything collapses into a slide-down drawer
- Theme toggle: sun/moon icon, switches between dark and light mode via `next-themes`
- Active nav link: slightly brighter text, no underline

---

## 5. Design System (implement as Tailwind config + CSS variables)

### 5.1 Colors

```js
// tailwind.config.js — extend colors
colors: {
  bg: {
    base:    '#0B0F1A',   // page background (dark)
    surface: '#111827',   // card / panel background
    hover:   '#1A2235',   // card hover state
  },
  accent: {
    blue:    '#1E6FD9',   // primary CTA, links, progress bar
    blueMid: '#85B7EB',   // secondary blue, CS topic
    indigo:  '#7F77DD',   // mathematics topic
    teal:    '#5DCAA5',   // physics topic
    pink:    '#ED93B1',   // medicine topic
    amber:   '#EF9F27',   // highlights, active animation states
  },
  text: {
    primary:   '#E8EDF5',
    secondary: 'rgba(232,237,245,0.6)',
    muted:     'rgba(232,237,245,0.35)',
  },
  border: {
    DEFAULT: 'rgba(255,255,255,0.08)',
    hover:   'rgba(255,255,255,0.18)',
  }
}
```

Light mode overrides (via CSS variables on `[data-theme="light"]`):
- `bg-base` → `#F8F9FC`
- `bg-surface` → `#FFFFFF`
- `text-primary` → `#0B0F1A`
- `text-secondary` → `rgba(11,15,26,0.6)`
- `border` → `rgba(0,0,0,0.08)`

### 5.2 Typography

```js
// tailwind.config.js
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

Scale:
| Role | Size | Weight | Notes |
|---|---|---|---|
| Display / hero | `text-4xl` (36px) | 700 | letter-spacing: -0.5px |
| Article title | `text-2xl` (24px) | 700 | letter-spacing: -0.3px |
| Card title | `text-sm` (14px) | 600 | |
| Body prose | `text-base` (16px) | 400 | line-height: 1.75 |
| Meta / label | `text-xs` (11px) | 500 | uppercase, letter-spacing: 0.06em |
| Code | `text-sm` (14px) | 400 | font-mono |

### 5.3 Spacing & Radius

- Card border radius: `rounded-2xl` (16px)
- Button / pill radius: `rounded-full`
- Inner element radius: `rounded-lg` (8px)
- Section padding: `px-5 py-8` on mobile, `px-8 py-12` on desktop
- Article body max-width: `max-w-[680px] mx-auto`
- Homepage grid max-width: `max-w-[1100px] mx-auto`

### 5.4 Topic Color Mapping

| Topic | Badge color | Tailwind class |
|---|---|---|
| Mathematics | Indigo | `text-indigo bg-indigo/15 border-indigo/25` |
| Physics | Teal | `text-teal bg-teal/15 border-teal/25` |
| Computer Science | Blue | `text-blueMid bg-blueMid/15 border-blueMid/25` |
| Medicine | Pink | `text-pink bg-pink/15 border-pink/25` |

---

## 6. Article Content Format (MDX frontmatter)

Every article file lives at `/content/articles/[slug].mdx` and must have this frontmatter:

```yaml
---
title: "Sieve of Eratosthenes"
subtitle: "The ancient algorithm that finds every prime — and why it still works."
topic: "Mathematics"          # Mathematics | Physics | Computer Science | Medicine
slug: "sieve-of-eratosthenes"
date: "2025-06-18"
readTime: 8                   # in minutes
featured: true                # true = eligible for the big featured card slot
description: "Start with every number, then cross out the non-primes. What's left is beautiful."
---
```

---

## 7. Animation Component System

### 7.1 Architecture

Each article has its own animation component at:
```
/components/animations/[ArticleName]Animation.tsx
```

The component is imported in the MDX file like:
```mdx
import { SieveAnimation } from '@/components/animations/SieveAnimation'

<SieveAnimation />
```

### 7.2 Animation Block UI Pattern

Every animation component must follow this exact shell:

```tsx
<div className="animation-block">
  {/* Title bar */}
  <div className="animation-header">
    <span className="animation-label">
      <PlayIcon size={13} /> Interactive
    </span>
    <button onClick={reset}>Reset</button>
  </div>

  {/* The actual visualization — canvas, SVG, or DOM */}
  <div className="animation-canvas">
    {/* visualization here */}
  </div>

  {/* Controls */}
  <div className="animation-controls">
    {/* sliders, play button, readouts */}
  </div>
</div>
```

CSS classes for the animation block (add to global CSS or Tailwind components layer):
```css
.animation-block {
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  margin: 2rem 0;
}
.animation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--border);
}
.animation-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-blue);
}
.animation-canvas {
  padding: 20px;
  min-height: 200px;
}
.animation-controls {
  padding: 12px 16px;
  border-top: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}
```

### 7.3 Intersection Observer (auto-play on scroll)

Wrap every animation with this hook:

```tsx
// hooks/useAnimationTrigger.ts
import { useEffect, useRef, useState } from 'react'

export function useAnimationTrigger(threshold = 0.3) {
  const ref = useRef<HTMLDivElement>(null)
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true)
        }
      },
      { threshold }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [triggered, threshold])

  return { ref, triggered, reset: () => setTriggered(false) }
}
```

Usage in animation component:
```tsx
const { ref, triggered, reset } = useAnimationTrigger()
// triggered = true → start animation
// reset() → called by the Reset button
```

---

## 8. Reading Progress Bar

Implement as a client component fixed at the very top of the viewport (above the navbar, `z-50`):

```tsx
// components/ReadingProgress.tsx
'use client'
import { useEffect, useState } from 'react'

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const total = scrollHeight - clientHeight
      setProgress(total > 0 ? (scrollTop / total) * 100 : 0)
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <div
      className="fixed top-0 left-0 h-[3px] bg-accent-blue z-50 transition-all duration-75"
      style={{ width: `${progress}%` }}
    />
  )
}
```

Only render this inside `/articles/[slug]` layout, not on homepage or about.

---

## 9. Seed Articles (5 total)

Claude Code must create all 5 as real MDX files with working animation components.

### Article 1 — Sieve of Eratosthenes
- **Topic:** Mathematics
- **Slug:** `sieve-of-eratosthenes`
- **Featured:** true
- **Animation:** Grid of numbers 2–100. User sets limit with a slider (20–150). Play button steps through: highlight current prime in amber, cross out its multiples in faded blue. Speed slider controls step interval. Reset clears to initial state.
- **Key concepts to explain:** definition of prime, why we start at 2, why we only need to sieve up to √N, time complexity O(n log log n)
- **KaTeX formulas to include:** `$p \leq \sqrt{N}$`, `$O(n \log \log n)$`

### Article 2 — Fourier Transform
- **Topic:** Mathematics
- **Slug:** `fourier-transform`
- **Featured:** false
- **Animation:** Show a composite wave (sum of 3 sine waves). Sliders for frequency and amplitude of each component wave. As user drags, waves update live. A second panel shows the frequency spectrum (bar chart). Play button animates the decomposition.
- **Key concepts:** superposition, frequency domain vs time domain, what the transform actually computes
- **KaTeX formulas:** `$\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx$`

### Article 3 — Sorting Algorithms
- **Topic:** Computer Science
- **Slug:** `sorting-algorithms`
- **Featured:** false
- **Animation:** Array of 20 vertical bars (random heights). Dropdown to pick algorithm: Bubble Sort, Merge Sort, Quick Sort, Insertion Sort. Speed slider. Play animates the sort — bars being compared highlight in amber, bars being swapped animate. Comparison counter and swap counter shown live.
- **Key concepts:** comparison-based sorting, best/average/worst case, why O(n log n) is optimal
- **KaTeX formulas:** `$O(n^2)$`, `$O(n \log n)$`

### Article 4 — Wave-Particle Duality
- **Topic:** Physics
- **Slug:** `wave-particle-duality`
- **Featured:** false
- **Animation:** Double-slit experiment. Toggle between "particle mode" (dots hitting screen, random scatter) and "wave mode" (interference pattern builds up dot by dot). Speed slider for how fast dots fire. Reset clears the screen. The interference fringes emerge naturally as dots accumulate.
- **Key concepts:** double-slit experiment, interference, measurement problem (observer effect simplified), de Broglie wavelength
- **KaTeX formulas:** `$\lambda = \frac{h}{p}$`, `$\Delta x \cdot \Delta p \geq \frac{\hbar}{2}$`

### Article 5 — How the Heart's Electrical Signal Works
- **Topic:** Medicine
- **Slug:** `cardiac-electrical-signal`
- **Featured:** false
- **Animation:** Simplified cross-section of the heart (4 chambers as rounded rectangles). Animation shows the electrical signal propagating: SA node fires → atria contract (highlight in pink) → AV node delays → ventricles contract (highlight in red). Below it, a live ECG trace draws in real time (P wave → QRS complex → T wave). Play/pause and reset controls.
- **Key concepts:** SA node, AV node, depolarization, what each part of the ECG waveform means
- **KaTeX formulas:** none required, but membrane potential can be shown: `$V_m = \frac{RT}{zF} \ln\frac{[K^+]_o}{[K^+]_i}$`

---

## 10. Component File Structure

```
scimotion/
├── app/
│   ├── layout.tsx                  # Root layout: fonts, ThemeProvider, navbar, footer
│   ├── page.tsx                    # Homepage
│   ├── about/
│   │   └── page.tsx
│   └── articles/
│       └── [slug]/
│           └── page.tsx            # Article page — reads MDX, renders with ReadingProgress
├── components/
│   ├── Navbar.tsx
│   ├── ThemeToggle.tsx
│   ├── ArticleCard.tsx             # Used on homepage + related posts
│   ├── TopicBadge.tsx
│   ├── ReadingProgress.tsx
│   ├── ShareButtons.tsx
│   ├── RelatedPosts.tsx
│   └── animations/
│       ├── SieveAnimation.tsx
│       ├── FourierAnimation.tsx
│       ├── SortingAnimation.tsx
│       ├── DoubleSlit Animation.tsx
│       └── CardiacAnimation.tsx
├── content/
│   └── articles/
│       ├── sieve-of-eratosthenes.mdx
│       ├── fourier-transform.mdx
│       ├── sorting-algorithms.mdx
│       ├── wave-particle-duality.mdx
│       └── cardiac-electrical-signal.mdx
├── hooks/
│   └── useAnimationTrigger.ts
├── lib/
│   └── articles.ts                 # Helper: read all MDX frontmatter, get article by slug
├── styles/
│   └── globals.css                 # CSS variables, animation-block styles, KaTeX overrides
├── tailwind.config.ts
├── next.config.mjs                 # MDX + remark-math + rehype-katex config
└── package.json
```

---

## 11. Key UX Rules (non-negotiable)

1. **No layout shift** — every animation block has a fixed min-height so the page doesn't jump when the component loads.
2. **Animations respect `prefers-reduced-motion`** — if the user has reduced motion enabled in their OS, animations skip to the final state immediately.
3. **Mobile responsive** — homepage grid collapses to single column below 640px. Article body is full-width on mobile with `px-5` padding. Animation controls stack vertically on small screens.
4. **Dark mode is default** — `next-themes` defaultTheme is `"dark"`. Light mode is available via the toggle.
5. **No animation runs on the server** — all animation components must be `'use client'` and use `dynamic()` import with `{ ssr: false }` at the article page level if needed.
6. **KaTeX styles** — import `katex/dist/katex.min.css` in `globals.css` or root layout.
7. **Article card thumbnails** — each article has a static SVG thumbnail generated inline (not an image file). The thumbnail visually hints at the article's animation.
8. **Share buttons** — Twitter/X share opens `https://twitter.com/intent/tweet?text=...&url=...`. Copy link uses `navigator.clipboard.writeText(window.location.href)` with a "Copied!" toast.
9. **Reading time** — calculated from frontmatter `readTime` field, shown as "8 min read".
10. **Font loading** — use `next/font/google` with `display: 'swap'` to avoid FOUT.

---

## 12. packages to install

```bash
npm install next react react-dom
npm install -D typescript @types/react @types/node tailwindcss postcss autoprefixer
npm install @next/mdx @mdx-js/loader @mdx-js/react
npm install next-mdx-remote gray-matter
npm install remark-math rehype-katex katex
npm install next-themes
npm install lucide-react
npm install next-mdx-remote
```

---

## 13. Out of Scope (MVP)

- User authentication / accounts
- Comments system
- Newsletter backend (show the UI, wire the input, but no actual email sending)
- Search functionality (show the icon, link to `/search`, but page can say "coming soon")
- CMS integration
- i18n / Bahasa Indonesia support (planned for v2)
- Analytics (add later)
