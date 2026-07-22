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
    articleSlugs: ['the-derivative', 'complex-numbers', 'eulers-formula', 'taylor-series', 'newtons-method', 'gradient-descent', 'eigenvectors-and-eigenvalues', 'fourier-transform'],
  },
  {
    slug: 'algorithms-and-computation',
    title: 'Algorithms & Computation',
    description:
      'How machines search, sort, explore connected data, and sift the primes — the core algorithmic ideas, step by step.',
    articleSlugs: ['binary-search', 'sorting-algorithms', 'hash-tables', 'dynamic-programming', 'graph-traversal', 'sieve-of-eratosthenes', 'public-key-cryptography', 'neural-networks', 'distributed-consensus', 'p-vs-np', 'finite-automata', 'halting-problem'],
  },
  {
    slug: 'motion-space-and-quanta',
    title: 'Motion, Space & Quanta',
    description:
      'Start with a swinging weight, bend time with relativity, and end where classical physics breaks down entirely.',
    articleSlugs: ['pendulum-motion', 'resonance', 'fluid-dynamics', 'keplers-laws', 'doppler-effect', 'entropy-and-the-second-law', 'time-dilation', 'electromagnetic-waves', 'wave-particle-duality', 'nuclear-energy', 'superconductivity'],
  },
  {
    slug: 'chance-chaos-and-information',
    title: 'Chance, Chaos & Information',
    description:
      'What can be said about a system nobody can predict — from a jittering pollen grain to the bell curve, the limits of forecasting, and the arithmetic of uncertainty itself.',
    // Ordered as a widening treatment of unpredictability: physical randomness,
    // then why it aggregates predictably, then reasoning under it, then processes
    // in time, then deterministic-but-unpredictable, then measuring it, then
    // acting under it.
    articleSlugs: ['brownian-motion', 'central-limit-theorem', 'bayes-theorem', 'markov-chains', 'chaos-theory', 'information-theory', 'nash-equilibrium'],
  },
  {
    slug: 'matter-and-reactions',
    title: 'Matter & Reactions',
    description:
      'Start with what holds two atoms together, then follow reactions through speed, balance, and the transfer of protons and electrons.',
    // Ordered so each article supplies what the next one assumes: kinetics and
    // equilibrium come before acids/bases (Ka is an equilibrium constant) and
    // before electrochemistry (the Nernst equation is equilibrium applied to redox).
    articleSlugs: ['atomic-structure', 'chemical-bonding', 'kinetic-theory', 'phase-transitions', 'reaction-kinetics', 'gibbs-free-energy', 'chemical-equilibrium', 'acids-and-bases', 'electrochemistry'],
  },
  {
    slug: 'planet-earth',
    title: 'Planet Earth',
    description:
      'The machinery of a working planet — the rock that moves beneath it, the air and ocean that carry its heat, and the carbon and radiation budgets that set its temperature.',
    // Solid earth first, then the fluid envelopes that ride on it, then the two
    // budgets — radiation and carbon — that the circulation articles feed into.
    articleSlugs: ['plate-tectonics', 'seismic-waves', 'earths-magnetic-field', 'atmospheric-convection', 'ocean-circulation', 'greenhouse-effect', 'carbon-cycle', 'ice-ages'],
  },
  {
    slug: 'life-molecules-to-organisms',
    title: 'Life: Molecules to Organisms',
    description:
      'Start with the principle that organises all of biology, then build upward — the code, what it folds into, how energy gets in, and how cells signal and defend.',
    // Selection first, because it is the only thing that makes the rest
    // non-arbitrary; then molecules, then energy, then cells.
    articleSlugs: ['natural-selection', 'dna-replication', 'gene-expression', 'protein-folding', 'photosynthesis', 'cellular-respiration', 'action-potential', 'immune-response'],
  },
  {
    slug: 'the-clinical-body',
    title: 'The Clinical Body',
    description:
      'Medicine as measurement and control — reading the heart’s electrical trace, holding glucose in range, tracking a drug through the body, seeing inside it, and losing ground to resistant bacteria.',
    articleSlugs: ['cardiac-electrical-signal', 'blood-pressure', 'glucose-insulin-regulation', 'the-kidney', 'pharmacokinetics', 'antibiotic-resistance', 'mri-imaging', 'epidemic-models'],
  },
  {
    slug: 'across-the-universe',
    title: 'Across the Universe',
    description:
      'Outward through the cosmos — from the life and death of a single star to the elements it forges, the worlds around others, the extremes of gravity, and the expansion of everything.',
    // Scale outward: one star, what stars make, other stars' planets, the most
    // extreme endpoint, and finally the whole expanding universe.
    articleSlugs: ['life-cycle-of-stars', 'stellar-nucleosynthesis', 'exoplanets', 'black-holes', 'galaxies-and-dark-matter', 'cosmic-distance-ladder', 'expanding-universe'],
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
