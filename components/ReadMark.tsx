'use client'
import { Check } from 'lucide-react'
import { useProgress } from '@/hooks/useProgress'

// A tick on any card or step the reader has finished. Renders nothing on the
// server and for unread articles, so it never shifts a layout that has no tick.
export function ReadMark({ slug, className = '' }: { slug: string; className?: string }) {
  const { read } = useProgress()
  if (!read[slug]) return null
  return (
    <span className={`inline-flex items-center gap-1 text-topic-physics ${className}`}>
      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
      Read
    </span>
  )
}
