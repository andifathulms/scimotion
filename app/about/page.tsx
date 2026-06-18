import Link from 'next/link'
import { TopicBadge } from '@/components/TopicBadge'

const topics = [
  {
    topic: 'Mathematics' as const,
    description: 'From prime numbers to Fourier transforms — the hidden patterns that structure reality.',
  },
  {
    topic: 'Physics' as const,
    description: 'Quantum mechanics, waves, and relativity — the rules the universe actually runs on.',
  },
  {
    topic: 'Computer Science' as const,
    description: 'Algorithms, complexity, and computation — how machines think and why it matters.',
  },
  {
    topic: 'Medicine' as const,
    description: 'The biology of the body — from electrical signals in the heart to how drugs work.',
  },
]

export default function AboutPage() {
  return (
    <div className="max-w-[680px] mx-auto px-5 py-12">
      <h1 className="text-4xl font-bold text-text-primary mb-8" style={{ letterSpacing: '-0.5px' }}>
        About Scimotion
      </h1>
      <p className="text-text-secondary text-base leading-relaxed mb-6">
        Science is often taught as a set of facts to memorize. Scimotion exists to change that — every concept here is explained the way it actually works: through motion, interaction, and visual intuition.
      </p>
      <p className="text-text-secondary text-base leading-relaxed mb-12">
        Each article builds from first principles, then hands you the controls. Drag a slider. Watch the pattern change. That&apos;s when you actually understand.
      </p>

      <h2 className="text-xl font-semibold text-text-primary mb-6">What we cover</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {topics.map(({ topic, description }) => (
          <div
            key={topic}
            className="bg-bg-surface border border-border rounded-2xl p-5 hover:border-border-hover transition-all"
          >
            <div className="mb-3">
              <TopicBadge topic={topic} />
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
          </div>
        ))}
      </div>

      <Link
        href="/"
        className="block w-full text-center py-3 rounded-full bg-accent-blue text-white font-medium hover:bg-accent-blue/90 transition-colors"
      >
        Start reading →
      </Link>
    </div>
  )
}
