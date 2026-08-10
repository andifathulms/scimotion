'use client'
import type { ComponentProps } from 'react'
import { useSettledAnnounce } from '@/hooks/useSettledAnnounce'

/**
 * A widget's summary readout, made audible without becoming a firehose.
 *
 * Drop-in for the <span> that already reported where the model is; it takes the
 * same props, because several readouts carry an inline colour that encodes a
 * verdict (spontaneous, supercritical, converged) and losing it would change
 * what the widget says on screen.
 *
 * The announce-on-settle behaviour, and why a naive live region here would make
 * things worse, is in useSettledAnnounce.
 */
export function WidgetStatus({ children, ...rest }: ComponentProps<'span'>) {
  const { ref, text, live } = useSettledAnnounce<HTMLSpanElement>()

  return (
    <>
      {/* Hidden from the accessibility tree so the same numbers are not present
          twice, once as static content and once as a live region. Nothing about
          the visible rendering changes. */}
      <span ref={ref} {...rest} aria-hidden="true">
        {children}
      </span>
      <span role="status" aria-live={live} aria-atomic="true" className="sr-only">
        {text}
      </span>
    </>
  )
}
