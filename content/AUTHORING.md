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

## 7. Addressable state and equation binding

Any widget with a slider should declare its parameters through `useWidgetParams`
instead of a bare `useState` per knob. One declaration then drives three things
that used to be written out separately and could drift apart: the slider bounds,
the value restored from a shared link, and the symbol the equation readout picks
out.

```tsx
// Module scope. An object literal in the render body is a fresh reference every
// frame, which defeats the memos inside the hook.
const SPEC = {
  length: { default: 160, min: 60, max: 220, step: 10, symbol: 'L', unit: 'px' },
  gravity: { default: 9.81, min: 1, max: 20, step: 0.5, symbol: 'g', unit: 'm/s²' },
}

export function ThingAnimation() {
  const { params, set, reset: resetParams, permalink, isDefault, restored } =
    useWidgetParams('thing', SPEC)          // 'thing' namespaces the URL keys
  const { length, gravity } = params
  ...
  <div className="animation-header">
    <span className="animation-label">…</span>
    <div className="flex items-center gap-3">
      <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
      <button onClick={reset}>Reset</button>
    </div>
  </div>
  ...
  <input type="range" min={SPEC.length.min} max={SPEC.length.max}
         step={SPEC.length.step} value={length}
         onChange={e => set('length', +e.target.value)} />
```

Rules:

- **Take bounds from `SPEC`, never re-type them on the input.** The whole point is
  that the restored value and the reachable value are the same set.
- **If `reset()` restored slider defaults, call the hook's `resetParams()`** rather
  than re-listing the literals. If Reset only replays the simulation, leave it.
- **A parameter that must not be an arbitrary number in its range does not belong
  in the spec as itself.** The spec clamps a numeric interval and nothing else.
  Store an index into a list instead — `ModularExponentiationAnimation` keeps its
  modulus as an index into `PRIMES`, because a hash is editable text and a
  composite modulus would silently invalidate the article's subject.
- **Ranges that depend on another parameter** cannot be expressed. Give the spec
  the widest bounds any configuration allows and clamp on read.

Then bind the article's equation to the controls with `<EquationReadout>`:

```tsx
<EquationReadout
  formula="T = 2π√(L/g)"                       // plain unicode, not KaTeX
  bindings={[{ symbol: 'L', value: '0.22 m' }, { symbol: 'g', value: '9.81 m/s²' }]}
  result="0.94 s"
  assumption="small-angle approximation — the simulation integrates the exact equation"
/>
```

Put the same symbol on the slider label (`Length <span className="text-accent-gold">L</span>`)
so dragging the knob and watching the letter change is one motion.

**`assumption` is not optional decoration.** Printing a formula next to a running
simulation makes any disagreement between the two visible and checkable, which is
the point — but it means an idealisation presented as the answer is now a lie the
reader can catch. If the formula is a linearisation, a steady-state, or holds
something constant that the simulation varies, say so. Name the assumption;
do not compute the error.

**Do not derive a quantity here that the component already computes.** Reuse the
existing value. `MarkovChainAnimation` reuses its `pi`; a second, hand-written
stationary formula in the readout would have been a competing source of truth,
and — because that chain has three states, not two — a wrong one.

## 8. Accessibility (required)

The widget is the article. If it is unreachable or unreadable, the article has
no content for that reader.

- **Every slider lives inside a `<label>`.** Implicit association — no `id`, no
  `htmlFor`, no `aria-label`. A `<span>` next to the input is adjacency, not a
  name; a screen reader announces "slider, 60" and never says of what.
- **Every `<canvas>` carries `role="img"` and an `aria-label`** describing what is
  drawn. Fallback content between the tags is the native mechanism, but screen
  readers surface that subtree inconsistently, so this is the reliable form. Say
  what the picture shows, not what the widget is called.
- **Anything the pointer can do, the keyboard must do too.** If a value can be
  set by dragging on the canvas, it needs a control that writes the same state.
  Drag is an enhancement, never the only route. Prefer a slider; use `<select>`
  when the choice is one of a fixed named set.
- **Wrap the summary readout in `<WidgetStatus>`.** Never put a bare
  `aria-live` on it. Most widgets re-render every animation frame, and a live
  region on a value moving at 60Hz queues an utterance per frame — the reader
  falls behind or is talked over, and hears less than they would from silence.
  `WidgetStatus` announces only once a value has held still for 900ms, and never
  announces the first one. `<EquationReadout>` already does this internally.
  Keep standing caveats out of the announced element: a caution repeated on
  every settle buries the number it qualifies.
- **Never signal state with colour alone.** A correct/incorrect or on/off state
  needs a shape, an icon or text beside the hue.
- **Autoplay must respect `prefers-reduced-motion`** — `useAnimationTrigger`
  hands the callback a `reduced` flag; use it. Motion the reader explicitly
  starts by pressing Play is fine.
- **Do not label what is already named.** A visual sitting beside its own title
  is decoration: mark it `aria-hidden`. Over-labelling is as much a defect as
  no label.

## 9. Learning path (optional)

If the article belongs in a sequence, add its slug to the right path in `lib/paths.ts`.
Each article should appear in at most one path so prev/next stays unambiguous.

## Checklist for a new article

- [ ] `content/articles/<slug>.mdx` with complete, valid frontmatter
- [ ] Unique hero entry in `components/ArticleVisual.tsx`
- [ ] Two animation components, registered in `ArticleAnimations.tsx` + page map
- [ ] Sliders declared through `useWidgetParams`, with `<WidgetLink>` in the header (§7)
- [ ] `<EquationReadout>` binding the article's equation to those sliders, with
      its `assumption` stated if the formula is an idealisation (§7)
- [ ] Body follows the section flow, primary + secondary animations embedded
- [ ] 3-question quiz in frontmatter
- [ ] `<KeyTakeaways>` block at the end
- [ ] Sliders in `<label>`; canvas has role="img" + aria-label; no pointer-only
      interaction; autoplay respects reduced motion (§8)
- [ ] Added to a learning path in `lib/paths.ts` (if applicable, §9)
- [ ] `npm run build` and `npm run lint` pass
