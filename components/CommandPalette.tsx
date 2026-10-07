'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CornerDownLeft, Route, Search } from 'lucide-react'
import { TOPICS, topicToSlug, topicVar, type Topic } from '@/lib/topics'
import { BASE_PATH } from '@/lib/site'
import { useProgress } from '@/hooks/useProgress'
import { TopicGlyph } from './TopicGlyph'
import type { SearchIndex } from '@/app/search-index.json/route'

/**
 * ⌘K search from any page.
 *
 * Opens on ⌘K / Ctrl+K, on "/" when the reader is not typing, and on a click of
 * anything marked `data-search-trigger` (the navbar and hero search links). Those
 * stay real links to /search, so without JavaScript — or with a modifier held,
 * to open a new tab — they still go somewhere.
 *
 * A native <dialog> opened with showModal() supplies the focus trap, Esc to
 * close, and the inert page behind it, which is the part of a modal that is
 * easiest to get subtly wrong by hand. The index is a static JSON file fetched
 * on first open (see app/search-index.json).
 */

type Item =
  | { kind: 'article'; href: string; title: string; detail: string; topic: Topic }
  | { kind: 'path'; href: string; title: string; detail: string }
  | { kind: 'topic'; href: string; title: string; detail: string; topic: Topic }

const MAX_ARTICLES = 8

export function CommandPalette() {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const progress = useProgress()

  const show = useCallback(() => {
    const d = dialogRef.current
    if (!d || d.open) return
    d.showModal()
    setOpen(true)
    setQuery('')
    setCursor(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    if (!index) {
      fetch(`${BASE_PATH}/search-index.json`)
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: SearchIndex) => setIndex(data))
        .catch(() => setFailed(true))
    }
  }, [index])

  const close = useCallback(() => dialogRef.current?.close(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (dialogRef.current?.open) close()
        else show()
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement
        if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
        e.preventDefault()
        show()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const trigger = (e.target as HTMLElement).closest('[data-search-trigger]')
      if (!trigger) return
      e.preventDefault()
      show()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [show, close])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const terms = q.split(/\s+/).filter(Boolean)
    const matches = (s: string) => terms.every(t => s.toLowerCase().includes(t))
    const out: Item[] = []

    if (!q) {
      const last = progress.last && index?.articles.find(a => a.slug === progress.last!.slug)
      if (last) {
        out.push({ kind: 'article', href: `/articles/${last.slug}`, title: last.title, detail: 'Continue reading', topic: last.topic as Topic })
      }
      for (const p of index?.paths ?? []) {
        out.push({ kind: 'path', href: `/learn/${p.slug}`, title: p.title, detail: `Learning path · ${p.count} parts` })
      }
      return out
    }

    for (const t of TOPICS) {
      if (matches(t)) out.push({ kind: 'topic', href: `/topics/${topicToSlug(t)}`, title: t, detail: 'Field', topic: t })
    }
    for (const p of index?.paths ?? []) {
      if (matches(p.title)) out.push({ kind: 'path', href: `/learn/${p.slug}`, title: p.title, detail: `Learning path · ${p.count} parts` })
    }
    const articles = (index?.articles ?? [])
      .filter(a => matches(`${a.title} ${a.subtitle} ${a.topic} ${a.description} ${a.tags.join(' ')}`))
      // Title hits first: a reader typing "entropy" wants the entropy article
      // before the six that mention it.
      .sort((a, b) => Number(matches(b.title)) - Number(matches(a.title)))
      .slice(0, MAX_ARTICLES)
    for (const a of articles) {
      out.push({ kind: 'article', href: `/articles/${a.slug}`, title: a.title, detail: `${a.topic} · ${a.readTime} min`, topic: a.topic as Topic })
    }
    return out
  }, [query, index, progress.last])

  const go = (item: Item | undefined) => {
    if (!item) return
    close()
    router.push(item.href)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(items.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(items[cursor])
    }
  }

  useEffect(() => {
    document.getElementById(`cmdk-${cursor}`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      onClick={e => e.target === dialogRef.current && close()}
      aria-label="Search Scimotion"
      className="command-palette"
    >
      {open && (
        <div className="flex max-h-[min(70vh,560px)] flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setCursor(0)
              }}
              onKeyDown={onInputKey}
              placeholder="Search articles, fields and paths…"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-list"
              aria-activedescendant={items[cursor] ? `cmdk-${cursor}` : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
            />
            <kbd className="rounded-md border border-border bg-bg-hover px-1.5 py-0.5 font-mono text-[0.6875rem] text-text-muted">esc</kbd>
          </div>

          <ul id="cmdk-list" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
            {!index && !failed && <li className="px-3 py-8 text-center text-sm text-text-muted">Loading the library…</li>}
            {failed && (
              <li className="px-3 py-8 text-center text-sm text-text-secondary">
                The search index didn&apos;t load. Try the full search page instead.
              </li>
            )}
            {index && items.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-text-secondary">No matches for “{query.trim()}”. Try a broader term.</li>
            )}
            {items.map((item, i) => (
              <li
                key={item.href + item.detail}
                id={`cmdk-${i}`}
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => go(item)}
                className={`flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 ${i === cursor ? 'bg-bg-hover' : ''}`}
                style={'topic' in item ? ({ '--t': topicVar(item.topic) } as React.CSSProperties) : undefined}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    item.kind === 'path' ? 'bg-accent-gold/12 text-accent-gold' : 'bg-[color-mix(in_srgb,var(--t)_14%,transparent)] text-(--t)'
                  }`}
                >
                  {item.kind === 'path' ? <Route size={15} aria-hidden="true" /> : <TopicGlyph topic={item.topic} size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{item.title}</span>
                  <span className="block truncate text-xs text-text-muted">{item.detail}</span>
                </span>
                {i === cursor && <ArrowRight size={15} className="shrink-0 text-text-muted" aria-hidden="true" />}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 font-mono text-[0.6875rem] text-text-muted">
            <span>↑↓ move</span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft size={11} aria-hidden="true" /> open
            </span>
            <a
              href={`${BASE_PATH}/search/`}
              onClick={e => {
                e.preventDefault()
                close()
                router.push('/search')
              }}
              className="ml-auto hover:text-text-primary"
            >
              Full search →
            </a>
          </div>
        </div>
      )}
    </dialog>
  )
}
