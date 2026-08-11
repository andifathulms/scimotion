/**
 * The site's atom-and-play mark, at rest in the space beside the About intro.
 *
 * A server component on purpose: three orbits and three electrons, animated
 * entirely in CSS, so this adds no client JavaScript at all. It deliberately
 * does not use framer-motion (already the largest thing in the bundle) and
 * deliberately does not use requestAnimationFrame — a decorative loop that runs
 * forever is the exact problem the widget-visibility pass just fixed. CSS
 * transforms run on the compositor and cost the main thread nothing.
 *
 * aria-hidden because it is decoration sitting beside prose that already says
 * what the site is. Naming it would repeat the heading two elements above.
 */
export function AtomMark({ className = '' }: { className?: string }) {
  // Ellipse centred at (60,60): rx 52, ry 21. The electrons ride this exact
  // path via offset-path, so the dot cannot drift off its orbit the way a
  // hand-tuned keyframe would.
  const ORBIT = 'M 8 60 A 52 21 0 1 1 112 60 A 52 21 0 1 1 8 60'

  return (
    <svg
      viewBox="0 0 120 120"
      className={`atom-mark ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {[0, 60, 120].map((angle, i) => (
        <g key={angle} transform={`rotate(${angle} 60 60)`}>
          <ellipse
            cx="60"
            cy="60"
            rx="52"
            ry="21"
            fill="none"
            stroke="var(--color-accent-gold)"
            strokeWidth="1.5"
            opacity="0.35"
          />
          {/* Each electron starts a third of the way around its own orbit, so
              the three never bunch at the same point. */}
          <circle
            r="4"
            fill="var(--color-accent-gold)"
            className="atom-electron"
            style={{ offsetPath: `path('${ORBIT}')`, animationDelay: `${i * -2.6}s` }}
          />
        </g>
      ))}

      {/* Nucleus, carrying the play triangle from the app icon. */}
      <circle cx="60" cy="60" r="17" fill="var(--color-accent-gold)" />
      <path d="M55 51 L71 60 L55 69 Z" fill="var(--color-bg-base)" />
    </svg>
  )
}
