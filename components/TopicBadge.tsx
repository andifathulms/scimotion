import type { Topic } from '@/lib/topics'

const topicStyles: Record<Topic, string> = {
  Mathematics: 'text-accent-violet bg-accent-violet/15 border-accent-violet/25',
  Physics: 'text-accent-teal bg-accent-teal/15 border-accent-teal/25',
  Chemistry: 'text-accent-orange bg-accent-orange/15 border-accent-orange/25',
  Biology: 'text-accent-lime bg-accent-lime/15 border-accent-lime/25',
  'Earth & Climate': 'text-accent-cyan bg-accent-cyan/15 border-accent-cyan/25',
  'Computer Science': 'text-accent-blue bg-accent-blue/15 border-accent-blue/25',
  Medicine: 'text-accent-pink bg-accent-pink/15 border-accent-pink/25',
}

export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    // whitespace-nowrap keeps two-word topics on one line — "Earth & Climate"
    // was wrapping to two lines inside the pill and distorting its shape.
    <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium border ${topicStyles[topic]}`}>
      {topic}
    </span>
  )
}
