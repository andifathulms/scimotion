'use client'
import { Fragment, useMemo } from 'react'
import { useSettledAnnounce } from '@/hooks/useSettledAnnounce'

/**
 * Binds an article's equation to the widget's controls.
 *
 * This is the one format that puts a formula and a running instance of that
 * formula on the same screen at the same moment, and it was throwing the
 * advantage away: the article asserted a relationship in KaTeX, demonstrated it
 * in canvas four lines below, and never said they were the same object. A reader
 * dragged "Length" from 160 to 220, watched a number in the corner change, and
 * had no reason to connect it to the L he had just read.
 *
 * So: the formula is shown with its symbols picked out in the accent, and the
 * substitution is printed underneath. The symbols come from the widget's
 * ParamSpec, which is also what drives the slider bounds — one declaration, so
 * the label on the knob and the letter in the equation cannot drift apart.
 *
 * `assumption` exists because binding an equation to a simulation makes any
 * disagreement between them visible and checkable. Where the displayed formula
 * is an idealisation and the simulation integrates something stricter, that has
 * to be said. It names the assumption; it does not quantify the divergence.
 */

export type Binding = {
  /** Symbol exactly as it is written in `formula`. */
  symbol: string
  /** Already formatted for display, units included. */
  value: string
}

// Longest-first so "θ₀" is matched before a bare "θ", and every symbol is
// escaped — subscripts are fine but a stray "(" from a future symbol would
// otherwise compile into the pattern as a group.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function useHighlighted(formula: string, symbols: string[]) {
  return useMemo(() => {
    if (symbols.length === 0) return [formula]
    const ordered = [...symbols].sort((a, b) => b.length - a.length).map(escape)
    return formula.split(new RegExp(`(${ordered.join('|')})`, 'g'))
  }, [formula, symbols])
}

export function EquationReadout({
  formula,
  bindings,
  result,
  assumption,
}: {
  /** Plain text, e.g. "T = 2π√(L/g)". Unicode, not KaTeX — see note below. */
  formula: string
  bindings: Binding[]
  /** The value the formula evaluates to right now, already formatted. */
  result?: string
  assumption?: string
}) {
  // Free energy sweeps temperature on a rAF loop and Markov walks on a timer,
  // so this component's values move every frame in some widgets. It was a plain
  // aria-live="polite", which is exactly the per-frame firehose that
  // useSettledAnnounce exists to prevent — the same failure the bespoke readouts
  // had, in the one component that had already been "fixed".
  const { ref, text, live } = useSettledAnnounce<HTMLDivElement>()
  const symbols = useMemo(() => bindings.map(b => b.symbol), [bindings])
  const parts = useHighlighted(formula, symbols)
  const symbolSet = useMemo(() => new Set(symbols), [symbols])

  return (
    // This matters more here than anywhere else on the site: the thing the
    // equation describes is a <canvas>, so for a reader who cannot see the
    // diagram the substituted formula is the only channel onto what moving a
    // slider actually did.
    //
    // aria-atomic, because a formula only means something whole — hearing
    // "0.94" on its own answers no question.
    <div className="flex flex-col gap-1 text-xs">
    {/* The ref covers the formula and its substitution only. The assumption is
        a standing caveat, not a value: repeating "small-angle approximation —
        the simulation integrates the exact equation..." on every settle would
        bury the number it qualifies. It stays outside the announced text and
        inside the accessibility tree, where it can be read once. */}
    <div ref={ref} aria-hidden="true" className="flex flex-col gap-1">
      {/* Unicode rather than KaTeX on purpose. KaTeX renders the article's
          display math at build time with no client JS; pulling its runtime into
          a widget to typeset one line would ship ~270KB to every article for a
          fraction they mostly cannot see. These formulas are one line of
          arithmetic — √, π and superscripts carry them. */}
      <span className="font-mono text-text-secondary">
        {parts.map((p, i) => (
          <Fragment key={i}>
            {symbolSet.has(p) ? <span className="text-accent-gold">{p}</span> : p}
          </Fragment>
        ))}
        {result !== undefined && (
          <>
            {' = '}
            <strong className="text-text-primary font-semibold">{result}</strong>
          </>
        )}
      </span>
      <span className="font-mono text-text-muted">
        {bindings.map((b, i) => (
          <Fragment key={b.symbol}>
            {i > 0 && '  ·  '}
            <span className="text-accent-gold">{b.symbol}</span>
            {` = ${b.value}`}
          </Fragment>
        ))}
      </span>
    </div>
    {assumption && <span className="text-text-muted italic">{assumption}</span>}
    <span role="status" aria-live={live} aria-atomic="true" className="sr-only">
      {text}
    </span>
    </div>
  )
}
