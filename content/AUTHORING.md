# Article authoring standard

Every Scimotion article follows this template so the experience is consistent and
new posts drop in without bespoke wiring. Articles live in `content/articles/<slug>.mdx`.

## 1. Frontmatter (required)

```yaml
---
title: "The Title"
subtitle: "One sentence that sells the idea."
topic: "Mathematics"          # Mathematics | Physics | Computer Science | Medicine
slug: "the-slug"              # must match the filename
date: "2026-06-24"            # ISO date; drives ordering + RSS
readTime: 9                   # integer minutes
featured: false              # at most one featured article
description: "1–2 sentence summary used on cards, search, OG image, RSS."
tags: ["tag-one", "tag-two", "tag-three"]   # 3–4 lowercase, hyphenated
quiz:                         # exactly 3 questions (see §5)
  - q: "..."
    options: ["...", "...", "...", "..."]
    answer: 1                 # zero-based index of the correct option
    explanation: "One sentence."
---
```

Frontmatter is validated at build time (`lib/articles.ts` → `normalizeMeta`). A missing
required field fails the build.

## 2. Hero visual (required)

Each article has a unique, concept-specific SVG in `components/ArticleVisual.tsx`, keyed
by slug. It is shown on listing cards and as the banner at the top of the article. When
you add an article, add a matching entry to the `visuals` map — do **not** rely on a
topic fallback (that is the "shared hero" bug we fixed). Draw into the `300 × 120`
viewBox, use the topic accent color passed in as `c`, and keep shapes legible at card size.

## 3. Body structure

Aim for this flow (h2 sections, `##`):

1. **Hook** — a concrete, intuitive opening (no abstract definitions first).
2. **Core idea** — build the concept from first principles.
3. **Primary animation** — embed the main interactive widget; the prose around it should
   tell the reader what to try and what to notice.
4. **The math / mechanism** — formal treatment with KaTeX (`$inline$`, `$$block$$`).
5. **Secondary animation** — a focused widget that answers a question the first one raises.
6. **Why it matters / where it shows up** — real-world payoff.
7. **Key takeaways** — see §6.

## 4. Animations (two per article)

Every article ships **two** interactive widgets: a primary one and a focused secondary
one (e.g. a complexity chart, a limiting case, a second view of the same idea). Each is a
self-contained client component in `components/animations/`, registered in
`components/ArticleAnimations.tsx` (dynamic, `ssr: false`) and re-exported via the article
page's component map. Use the shared `useAnimationTrigger` hook for scroll-autoplay and
respect `prefers-reduced-motion`. Hand-write the visualization (canvas / SVG / rAF) — no
animation library for the science widgets.

## 5. Quiz (required)

Exactly three multiple-choice questions in frontmatter, each with four options, a
zero-based `answer`, and a one-sentence `explanation`. They render automatically in the
"Check your understanding" box at the end of the article. Test understanding, not recall.

## 6. Key takeaways (required)

Close the body with 3–5 bullets in the standard box:

```mdx
<KeyTakeaways>
- The single most important idea.
- A common misconception, corrected.
- Where this concept connects to others.
</KeyTakeaways>
```

## 7. Learning path (optional)

If the article belongs in a sequence, add its slug to the right path in `lib/paths.ts`.
Each article should appear in at most one path so prev/next stays unambiguous.

## Checklist for a new article

- [ ] `content/articles/<slug>.mdx` with complete, valid frontmatter
- [ ] Unique hero entry in `components/ArticleVisual.tsx`
- [ ] Two animation components, registered in `ArticleAnimations.tsx` + page map
- [ ] Body follows the section flow, primary + secondary animations embedded
- [ ] 3-question quiz in frontmatter
- [ ] `<KeyTakeaways>` block at the end
- [ ] Added to a learning path in `lib/paths.ts` (if applicable)
- [ ] `npm run build` and `npm run lint` pass
