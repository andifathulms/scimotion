import Link from 'next/link'

export function TagList({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <Link
          key={tag}
          href={`/tags/${encodeURIComponent(tag)}`}
          className="text-xs text-text-muted hover:text-accent-gold border border-border hover:border-border-hover rounded-full px-2.5 py-0.5 transition-colors"
        >
          #{tag}
        </Link>
      ))}
    </div>
  )
}
