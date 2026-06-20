type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'

const topicStyles: Record<Topic, string> = {
  Mathematics: 'text-accent-violet bg-accent-violet/15 border-accent-violet/25',
  Physics: 'text-accent-teal bg-accent-teal/15 border-accent-teal/25',
  'Computer Science': 'text-accent-blue bg-accent-blue/15 border-accent-blue/25',
  Medicine: 'text-accent-pink bg-accent-pink/15 border-accent-pink/25',
}

export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${topicStyles[topic]}`}>
      {topic}
    </span>
  )
}
