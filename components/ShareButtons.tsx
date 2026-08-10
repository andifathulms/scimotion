'use client'
import { useState } from 'react'
import { Share2, Link2 } from 'lucide-react'

export function ShareButtons({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="py-8">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">Share this article</p>
      <div className="flex items-center gap-3">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:border-border-hover bg-bg-surface hover:bg-bg-hover transition-all text-sm text-text-secondary"
        >
          <Share2 size={15} />
          Share on X
        </a>
        <button
          onClick={copyLink}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:border-border-hover bg-bg-surface hover:bg-bg-hover transition-all text-sm text-text-secondary"
        >
          <Link2 size={15} />
          {/* The label is the button's own accessible name, so swapping it
              renames the control rather than reporting an event. The status
              region is rendered whether or not it has content — one that
              appears together with its message is usually missed. */}
          Copy link
        </button>
        <span role="status" className="text-sm text-text-secondary">
          {copied ? 'Link copied' : ''}
        </span>
      </div>
    </div>
  )
}
