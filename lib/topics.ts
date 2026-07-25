// The single source of truth for article topics.
//
// This lives apart from lib/articles.ts on purpose: that module imports `fs` to
// read the content directory, so a client component importing TOPICS as a runtime
// value from there drags Node built-ins into the browser bundle and fails the
// build. Keep this file free of server-only imports.
//
// Adding a field here is the only type change needed — the accent and badge
// colour maps are typed Record<Topic, ...>, so they stop compiling until they
// cover the new value, which is the point.
export const TOPICS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Earth & Climate',
  'Astronomy & Cosmology',
  'Computer Science',
  'Networks & the Internet',
  'Medicine',
] as const

export type Topic = (typeof TOPICS)[number]

// One-line descriptions of each field, shared by the About page and the /topics
// directory so the two cannot drift apart. Record<Topic, string> means a new
// field will not compile until it has a description here.
export const TOPIC_DESCRIPTIONS: Record<Topic, string> = {
  Mathematics: 'From the derivative to the Fourier transform — the structures and patterns that underlie everything else.',
  Physics: 'Motion, waves, relativity and the quantum world — the rules the universe actually runs on.',
  Chemistry: 'Atoms, bonds and reactions — how matter is built and how it rearranges.',
  Biology: 'Life from the molecule up — the code, the machinery that reads it, and the cells it builds.',
  'Earth & Climate': 'The machinery of a working planet — its shifting crust, its circulating air and ocean, and the budgets that set its temperature.',
  'Astronomy & Cosmology': 'The universe at large scale — how stars live and forge the elements, how we find other worlds, and how space itself is expanding.',
  'Computer Science': 'Algorithms, complexity and the limits of computation — how machines solve problems, and what they provably cannot.',
  'Networks & the Internet': 'How the internet actually works — the chain of inventions, each one solving the limit the last hit, that carries a request from your browser to a server and back.',
  Medicine: 'The body as a system to measure and manage — its signals, its chemistry, and the tools that see inside it.',
}

// URL slug for a topic, e.g. "Earth & Climate" -> "earth-climate",
// "Computer Science" -> "computer-science". Kept here (not in the fs-touching
// lib/articles) so client components and static params can both use it.
export function topicToSlug(topic: Topic): string {
  return topic.toLowerCase().replace(/&/g, ' ').replace(/\s+/g, '-')
}

export function slugToTopic(slug: string): Topic | undefined {
  return TOPICS.find(t => topicToSlug(t) === slug)
}
