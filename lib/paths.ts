export type LearningPath = {
  slug: string
  title: string
  description: string
  articleSlugs: string[]
}

// Curated, ordered reading sequences. Each article belongs to exactly one path,
// so prev/next navigation within a path is unambiguous.
export const learningPaths: LearningPath[] = [
  {
    slug: 'calculus-and-transforms',
    title: 'Calculus & Transforms',
    description:
      'From rotating complex numbers to approximating any function and decomposing any signal — the analytic backbone of modern math.',
    articleSlugs: ['eulers-formula', 'taylor-series', 'newtons-method', 'gradient-descent', 'fourier-transform'],
  },
  {
    slug: 'algorithms-and-computation',
    title: 'Algorithms & Computation',
    description:
      'How machines search, sort, explore connected data, and sift the primes — the core algorithmic ideas, step by step.',
    articleSlugs: ['binary-search', 'sorting-algorithms', 'dynamic-programming', 'graph-traversal', 'sieve-of-eratosthenes'],
  },
  {
    slug: 'motion-space-and-quanta',
    title: 'Motion, Space & Quanta',
    description:
      'Start with a swinging weight, bend time with relativity, and end where classical physics breaks down entirely.',
    articleSlugs: ['pendulum-motion', 'keplers-laws', 'entropy-and-the-second-law', 'time-dilation', 'wave-particle-duality'],
  },
  {
    slug: 'signals-cells-and-randomness',
    title: 'Signals, Cells & Randomness',
    description:
      'The electrical and statistical machinery of living systems — from a firing neuron to the heartbeat to molecular diffusion and the bell curve.',
    articleSlugs: ['action-potential', 'cardiac-electrical-signal', 'brownian-motion', 'central-limit-theorem', 'bayes-theorem', 'immune-response'],
  },
]

export function getPath(slug: string): LearningPath | undefined {
  return learningPaths.find(p => p.slug === slug)
}

export type PathNav = {
  path: LearningPath
  index: number // zero-based position of the article in the path
  total: number
  prevSlug: string | null
  nextSlug: string | null
}

export function getPathNav(articleSlug: string): PathNav | null {
  for (const path of learningPaths) {
    const index = path.articleSlugs.indexOf(articleSlug)
    if (index === -1) continue
    return {
      path,
      index,
      total: path.articleSlugs.length,
      prevSlug: index > 0 ? path.articleSlugs[index - 1] : null,
      nextSlug: index < path.articleSlugs.length - 1 ? path.articleSlugs[index + 1] : null,
    }
  }
  return null
}
