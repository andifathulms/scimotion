'use client'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { EquationReadout } from '@/components/EquationReadout'

/**
 * The smallest complete unit of the thing this site does, on the landing view.
 *
 * The homepage was a claim, three counts, ten filter pills and a grid of titles
 * — pure navigation. For a site whose purpose is comprehension, the entry point
 * taught nothing and merely awaited input.
 *
 * This is deliberately NOT "a widget in the hero". A widget without its
 * paragraph is a toy, and a wall of toys is a screensaver. What makes an article
 * work is the sequence claim → control → consequence, so this is that sequence
 * at its smallest: one sentence that makes a falsifiable statement, one control
 * to test it with, and the arithmetic that produces the answer.
 *
 * The claim is chosen because it is wrong under the obvious intuition. Almost
 * everyone expects four times the length to swing four times as slowly. It
 * doesn't, and thirty seconds with the slider is a better argument than a
 * paragraph.
 *
 * No canvas and no animation: the point is a relationship between two numbers,
 * not motion, and a still diagram needs no reduced-motion escape hatch.
 */

const G = 9.81

const SPEC = {
  length: { default: 1, min: 0.25, max: 4, step: 0.25, symbol: 'L', unit: 'm' },
}

// Rod lengths are drawn to scale against the 4 m maximum, so the geometry the
// reader sees is the geometry in the formula rather than a decorative sketch.
const ROD_MAX_PX = 128

export function HeroDemo() {
  const { params, set } = useWidgetParams('demo', SPEC)
  const { length } = params

  const period = 2 * Math.PI * Math.sqrt(length / G)
  const quarter = 2 * Math.PI * Math.sqrt(length / 4 / G)
  const rodPx = (length / SPEC.length.max) * ROD_MAX_PX

  return (
    <section
      aria-labelledby="demo-heading"
      className="rounded-card border border-border bg-bg-surface p-5 sm:p-6"
    >
      <h2 id="demo-heading" className="text-base font-semibold text-text-primary">
        Quadruple a pendulum&apos;s length and it swings only twice as slowly.
      </h2>
      <p className="mt-1.5 text-sm text-text-secondary">
        Not four times. Drag the length and watch the period — this is what every
        article here does, at its smallest.
      </p>

      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-5">
        {/* Rod drawn to scale — no animation, just the two lengths side by side. */}
        <svg
          width="150"
          height={ROD_MAX_PX + 26}
          viewBox={`0 0 150 ${ROD_MAX_PX + 26}`}
          role="img"
          aria-label={`Two pendulums drawn to scale: ${length.toFixed(2)} metres beside a quarter of that length.`}
          className="shrink-0"
        >
          <line x1="10" y1="6" x2="140" y2="6" stroke="var(--color-border-hover)" strokeWidth="1.5" />
          {([
            [46, rodPx, 'var(--color-accent-gold)', `${length.toFixed(2)} m`],
            [104, rodPx / 4, 'var(--color-text-muted)', `${(length / 4).toFixed(2)} m`],
          ] as const).map(([x, len, colour, label]) => (
            <g key={x}>
              <line x1={x} y1="6" x2={x} y2={6 + len} stroke={colour} strokeWidth="1.5" />
              <circle cx={x} cy={6 + len} r="7" fill={colour} />
              <text
                x={x}
                y={ROD_MAX_PX + 22}
                textAnchor="middle"
                fontSize="10"
                fontFamily="monospace"
                fill="var(--color-text-muted)"
              >
                {label}
              </text>
            </g>
          ))}
        </svg>

        <div className="min-w-[15rem] flex-1">
          <label className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="shrink-0">
              Length <span className="text-accent-gold">L</span>
            </span>
            <input
              type="range"
              min={SPEC.length.min}
              max={SPEC.length.max}
              step={SPEC.length.step}
              value={length}
              onChange={e => set('length', +e.target.value)}
              className="w-full accent-accent-gold"
            />
            <span className="shrink-0 tabular-nums font-mono">{length.toFixed(2)} m</span>
          </label>

          <div className="mt-4">
            <EquationReadout
              formula="T = 2π√(L/g)"
              bindings={[
                { symbol: 'L', value: `${length.toFixed(2)} m` },
                { symbol: 'g', value: `${G} m/s²` },
              ]}
              steps={[
                `L ∕ g = ${length.toFixed(2)} ∕ ${G} = ${(length / G).toFixed(4)} s²`,
                `√${(length / G).toFixed(4)} = ${Math.sqrt(length / G).toFixed(4)} s`,
                `2π × ${Math.sqrt(length / G).toFixed(4)} = ${period.toFixed(2)} s`,
              ]}
              result={`${period.toFixed(2)} s`}
              assumption={`A quarter as long gives ${quarter.toFixed(2)} s — half, not a quarter, because the length sits under a square root. Small-angle approximation, and gravity taken as ${G} m/s².`}
            />
          </div>
        </div>
      </div>

      <Link
        href="/articles/pendulum-motion"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold hover:underline"
      >
        Why the square root, and where it stops working
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </section>
  )
}
