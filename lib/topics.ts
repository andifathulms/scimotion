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
  'Computer Science',
  'Medicine',
] as const

export type Topic = (typeof TOPICS)[number]
