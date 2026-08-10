'use client'
import { Fragment, useMemo } from 'react'

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
  const symbols = useMemo(() => bindings.map(b => b.symbol), [bindings])
  const parts = useHighlighted(formula, symbols)
  const symbolSet = useMemo(() => new Set(symbols), [symbols])

  return (
    // role="status" is the one piece of ARIA here that has no native
    // equivalent: there is no element that means "announce me when I change".
    // It matters more in this component than anywhere else on the site, because
    // the thing it describes is a <canvas> — a reader who cannot see the diagram
    // has the substituted equation as their only channel onto what moving a
    // slider actually did.
    //
    // aria-atomic, because the formula only means anything whole: hearing "0.94"
    // on its own is not an answer to a question.
    <div role="status" aria-live="polite" aria-atomic="true" className="flex flex-col gap-1 text-xs">
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
      {assumption && <span className="text-text-muted italic">{assumption}</span>}
    </div>
  )
}
