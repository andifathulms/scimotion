import { getAllTags } from '@/lib/articles'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tags — Scimotion',
  description: 'Browse interactive science articles by tag.',
}

export default async function TagsPage() {
  const tags = await getAllTags()
  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-2xl font-bold text-text-primary mb-8">
        Browse by tag
      </h1>
      <div className="flex flex-wrap gap-3">
        {tags.map(({ tag, count }) => (
          <Link
            key={tag}
            href={`/tags/${encodeURIComponent(tag)}`}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent-gold border border-border hover:border-border-hover rounded-pill px-3.5 py-1.5 transition-colors"
          >
            #{tag}
            <span className="text-text-muted">{count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
