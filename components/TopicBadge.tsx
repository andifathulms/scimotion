import { topicVar, type Topic } from '@/lib/topics'
import { TopicGlyph } from './TopicGlyph'

// One field colour drives text, tint and rule through a local --t, so the badge
// follows the theme without a per-topic class list. The glyph means the field is
// readable without telling nine hues apart.
export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    // whitespace-nowrap keeps two-word topics on one line — "Earth & Climate"
    // was wrapping to two lines inside the pill and distorting its shape.
    <span
      style={{ '--t': topicVar(topic) } as React.CSSProperties}
      className="inline-flex items-center gap-1.5 whitespace-nowrap pl-2 pr-2.5 py-0.5 rounded-pill text-xs font-medium border text-(--t) bg-[color-mix(in_srgb,var(--t)_12%,transparent)] border-[color-mix(in_srgb,var(--t)_24%,transparent)]"
    >
      <TopicGlyph topic={topic} size={12} />
      {topic}
    </span>
  )
}
