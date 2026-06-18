type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'

const topicStyles: Record<Topic, string> = {
  Mathematics: 'text-accent-indigo bg-accent-indigo/15 border-accent-indigo/25',
  Physics: 'text-accent-teal bg-accent-teal/15 border-accent-teal/25',
  'Computer Science': 'text-accent-blueMid bg-accent-blueMid/15 border-accent-blueMid/25',
  Medicine: 'text-accent-pink bg-accent-pink/15 border-accent-pink/25',
}

export function TopicBadge({ topic }: { topic: Topic }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${topicStyles[topic]}`}>
      {topic}
    </span>
  )
}
