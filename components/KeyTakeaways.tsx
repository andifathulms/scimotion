import type { ReactNode } from 'react'
import { Lightbulb } from 'lucide-react'

// The one callout in an article, so it is built to be found on a re-read: a
// sodium-tinted panel with a mono label, set apart from the prose around it.
export function KeyTakeaways({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="Key takeaways" className="key-takeaways my-12 rounded-card border border-accent-gold/25 bg-accent-gold/[0.07] p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent-gold/15 text-accent-gold">
          <Lightbulb size={15} aria-hidden="true" />
        </span>
        <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-accent-gold">Key takeaways</span>
      </div>
      {children}
    </aside>
  )
}
