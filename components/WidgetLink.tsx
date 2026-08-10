'use client'
import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

/**
 * "Link to this state" — the affordance that makes a widget configuration
 * addressable. Sits in the animation header beside Reset.
 *
 * Deliberately not shown while the widget is at its defaults: at that point the
 * article URL already reaches this exact state, and offering a second, longer
 * link that does the same thing invites the reader to paste a parameter list
 * that says nothing. The control appears once they have actually moved
 * something, which also makes its arrival a small hint that what they just did
 * was worth keeping.
 */
export function WidgetLink({
  permalink,
  hidden,
  restored,
}: {
  permalink: () => string
  hidden?: boolean
  /** True when this mount's values came from the URL rather than the defaults. */
  restored?: boolean
}) {
  const [copied, setCopied] = useState(false)

  // A reader who followed someone else's link is looking at values an author
  // did not choose. Saying so is the difference between "this is how the widget
  // starts" and "someone pointed me at this", which changes how much weight the
  // reader gives the configuration in front of them.
  if (hidden) {
    return restored ? (
      <span className="flex items-center gap-1 text-xs text-text-muted">
        <Link2 size={12} /> opened from a link
      </span>
    ) : null
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(permalink())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is permission-gated and unavailable over plain http. Leaving
      // the label unchanged is the honest failure: claiming "Copied" when
      // nothing reached the clipboard is worse than appearing not to respond.
    }
  }

  return (
    <button
      onClick={copy}
      title="Copy a link that reopens this widget with these values"
      className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
    >
      {copied ? <Check size={12} /> : <Link2 size={12} />}
      {copied ? 'Copied' : 'Link to this state'}
    </button>
  )
}
