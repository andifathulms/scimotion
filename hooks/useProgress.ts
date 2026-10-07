'use client'
import { useSyncExternalStore } from 'react'

/**
 * What this reader has read, where they left off, and how their quizzes went.
 *
 * Kept in localStorage: the site is a static export with no accounts, and this
 * is a per-reader convenience — "Continue reading", read ticks on cards and path
 * steps, a score on the up-next card. Losing it (private window, cleared site
 * data) costs nothing but the ticks, so every read and write is wrapped and a
 * failure degrades to "nothing read yet".
 *
 * Exposed through useSyncExternalStore with an empty server snapshot, so the
 * static HTML always renders the not-started state and hydration fills in the
 * reader's own progress without a mismatch. Other tabs stay in step through the
 * `storage` event.
 */

export type Progress = {
  /** slug → epoch ms when it was marked read */
  read: Record<string, number>
  /** The article most recently opened. */
  last?: { slug: string; at: number }
  /** slug → [score, total] from the article's quiz */
  quiz: Record<string, [number, number]>
}

const KEY = 'scimotion:progress:v1'
const EMPTY: Progress = { read: {}, quiz: {} }

let cache: Progress | null = null
const listeners = new Set<() => void>()

function load(): Progress {
  if (cache) return cache
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Progress>) : {}
    cache = { read: parsed.read ?? {}, quiz: parsed.quiz ?? {}, last: parsed.last }
  } catch {
    cache = EMPTY
  }
  return cache
}

function save(next: Progress) {
  cache = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: keep the in-memory copy for this visit.
  }
  listeners.forEach(l => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cache = null
    cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, load, () => EMPTY)
}

export function markVisited(slug: string) {
  const p = load()
  if (p.last?.slug === slug) return
  save({ ...p, last: { slug, at: Date.now() } })
}

export function markRead(slug: string) {
  const p = load()
  if (p.read[slug]) return
  save({ ...p, read: { ...p.read, [slug]: Date.now() } })
}

export function saveQuiz(slug: string, score: number, total: number) {
  const p = load()
  save({ ...p, quiz: { ...p.quiz, [slug]: [score, total] } })
}
