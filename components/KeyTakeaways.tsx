import type { ReactNode } from 'react'
import { Lightbulb } from 'lucide-react'

// Standard end-of-article summary box. In MDX, wrap a markdown bullet list:
//   <KeyTakeaways>
//   - First point
//   - Second point
//   </KeyTakeaways>
export function KeyTakeaways({ children }: { children: ReactNode }) {
  return (
    <div className="key-takeaways my-10 rounded-card border border-accent-gold/25 bg-accent-gold/[0.06] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={16} className="text-accent-gold" />
        <span className="text-sm font-semibold text-text-primary">Key takeaways</span>
      </div>
      {children}
    </div>
  )
}
