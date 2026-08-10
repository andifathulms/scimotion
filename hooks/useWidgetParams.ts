'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Addressable widget state.
 *
 * The most valuable thing on an article page is a configuration the reader
 * produced — the gravity that makes the period claim obvious, the mutation rate
 * where selection stops winning. It was also the only content on the site with
 * no address: every visitor arrived at the author's defaults, so the sliders
 * read as garnish on an animation rather than as the subject of the article.
 *
 * A widget declares its parameters once, as a spec with a domain. That spec is
 * the single source of truth for three things that used to be scattered: the
 * slider's min/max/step, the value restored from a link, and the symbol the
 * equation readout binds to (see components/EquationReadout.tsx).
 *
 * State lives in the URL, so it survives a refresh and can be handed to someone
 * else. Writes are debounced and go through replaceState: a slider drag emits a
 * value per frame, and both the history entry per frame and the throttle
 * browsers apply to rapid history writes (Safari: 100 per 30s) are avoided by
 * waiting for the drag to stop. replaceState also does not scroll, which
 * assigning to location.hash would.
 *
 * Returning to the defaults removes the keys rather than writing them out, so a
 * reader who resets gets the plain article URL back instead of a long one that
 * encodes "unchanged".
 *
 * Declare the spec at module scope, not inline in the component:
 *
 *   const SPEC = { angle: { default: 60, min: 5, max: 85, step: 1, symbol: 'θ₀' } } as const
 *   const { params, set, reset, permalink } = useWidgetParams('pendulum', SPEC)
 *
 * An object literal in the render body is a fresh reference every pass, which
 * defeats every memo in here. Nothing breaks — the values are identical — but
 * the work is repeated on each frame of a running simulation.
 */

export type ParamSpec = {
  /** Value on first load and after Reset. Must lie within [min, max]. */
  default: number
  min: number
  max: number
  /** Quantisation. Restored values snap to this grid, so a link is exact. */
  step?: number
  /** Symbol as it appears in the article's equation, e.g. "L", "θ₀", "p". */
  symbol?: string
  /** Unit for readouts, e.g. "m/s²". Omit for dimensionless quantities. */
  unit?: string
}

export type WidgetSpec = Record<string, ParamSpec>
export type ParamValues<S extends WidgetSpec> = { [K in keyof S]: number }

// #<widgetId>.<param>=<value>, several joined by "&". Namespaced by widget
// because an article carries two of them and both may be pinned in one link.
const KEY = (id: string, param: string) => `${id}.${param}`
const IS_PARAM = /^[^.=&]+\.[^.=&]+$/

// Long enough to sit past the end of a slider drag, short enough that a reader
// who changes one value and immediately hits refresh keeps it.
const WRITE_DELAY_MS = 400

function readHash(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

/**
 * The hash is shared with the table of contents, whose links are bare heading
 * anchors like "#the-math". Parsing that as a query gives the key "the-math"
 * with an empty value, and re-serialising it would emit "#the-math=&..." — an
 * anchor that no longer matches any heading id, so a permalink built on an
 * article the reader had scrolled through would quietly break its own jump link.
 * Only well-formed widget keys survive into a generated link.
 */
function paramsOnly(hash: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams()
  for (const [k, v] of hash) if (IS_PARAM.test(k)) out.set(k, v)
  return out
}

/**
 * Clamp to the declared domain and snap to the step grid.
 *
 * A hash is user-editable text, so a value arriving from one is untrusted: out
 * of range, non-numeric, or absent. Every path here ends at a number inside
 * [min, max], because the alternative is a NaN reaching a requestAnimationFrame
 * loop, where it silently poisons the simulation instead of failing.
 *
 * Snapping is what makes a link reproducible rather than approximate: the
 * restored value is the same one the slider can express, so the state a reader
 * shares is bit-identical to the state their recipient sees.
 */
export function coerce(raw: string | null, spec: ParamSpec): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const clamped = Math.min(spec.max, Math.max(spec.min, n))
  if (!spec.step) return clamped
  const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step
  // Re-clamp: a step that does not divide the range evenly can round past max.
  const bounded = Math.min(spec.max, Math.max(spec.min, snapped))
  // Kill float drift from the divide/multiply so 0.30000000000000004 cannot
  // reach a readout.
  return Math.round(bounded * 1e6) / 1e6
}

export function useWidgetParams<S extends WidgetSpec>(id: string, spec: S) {
  const defaults = useMemo(
    () => Object.fromEntries(Object.entries(spec).map(([k, s]) => [k, s.default])) as ParamValues<S>,
    [spec]
  )

  // Widgets are mounted through ArticleAnimations with `dynamic(ssr: false)`, so
  // there is no server render to disagree with and the hash can seed the very
  // first client render. Reading it in an effect instead would show the defaults
  // for a frame and then jump, which on an autoplaying simulation means the
  // reader watches the wrong model start before the right one replaces it.
  const [restored] = useState(() => {
    const hash = readHash()
    const out: Record<string, number> = {}
    let any = false
    for (const [k, s] of Object.entries(spec)) {
      const v = coerce(hash.get(KEY(id, k)), s)
      if (v !== null) { out[k] = v; any = true }
    }
    return any ? out : null
  })

  const [params, setParams] = useState<ParamValues<S>>(() => ({ ...defaults, ...restored }))

  const set = useCallback(<K extends keyof S & string>(key: K, value: number) => {
    setParams(p => ({ ...p, [key]: coerce(String(value), spec[key]) ?? spec[key].default }))
  }, [spec])

  const reset = useCallback(() => setParams(defaults), [defaults])

  // Built on demand, and merged into whatever is already in the hash so pinning
  // the second widget on a page does not silently drop the first.
  const permalink = useCallback(() => {
    const hash = paramsOnly(readHash())
    for (const [k, v] of Object.entries(params)) hash.set(KEY(id, k), String(v))
    const { origin, pathname, search } = window.location
    return `${origin}${pathname}${search}#${hash.toString()}`
  }, [id, params])

  const isDefault = useMemo(
    () => Object.entries(params).every(([k, v]) => v === spec[k].default),
    [params, spec]
  )

  // Persist to the URL so a refresh does not throw the reader's configuration
  // away. Debounced past the end of a drag; see the note at the top of the file.
  //
  // The first pass is skipped when the widget is untouched and nothing was
  // restored, so simply scrolling an article past a widget does not rewrite its
  // address. Any heading anchor already in the hash is dropped by paramsOnly —
  // the reader stays where they are, since replaceState does not scroll.
  const touched = !isDefault || restored !== null
  useEffect(() => {
    if (!touched) return
    const timer = setTimeout(() => {
      const hash = paramsOnly(readHash())
      for (const [k, v] of Object.entries(params)) {
        if (v === spec[k].default) hash.delete(KEY(id, k))
        else hash.set(KEY(id, k), String(v))
      }
      const str = hash.toString()
      const { pathname, search } = window.location
      window.history.replaceState(null, '', `${pathname}${search}${str ? `#${str}` : ''}`)
    }, WRITE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [params, spec, id, touched])

  return { params, set, reset, permalink, restored: restored !== null, isDefault }
}
