import { learningPaths } from '@/lib/paths'
import { getAllArticles } from '@/lib/articles'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Learning Paths',
  description: 'Curated, ordered reading sequences that build concepts from the ground up.',
  path: '/learn',
})

export default async function LearnPage() {
  const articles = await getAllArticles()
  const titleOf = (slug: string) => articles.find(a => a.slug === slug)?.title ?? slug

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-3xl font-bold text-text-primary mb-2">
        Learning paths
      </h1>
      <p className="text-text-secondary text-base mb-10 max-w-2xl">
        Curated sequences that build understanding step by step. Follow one start to finish, or dip into any article along the way.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {learningPaths.map(path => (
          <Link
            key={path.slug}
            href={`/learn/${path.slug}`}
            className="group block rounded-card border border-border bg-bg-surface p-6 hover:border-border-hover hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-text-primary group-hover:text-accent-gold transition-colors">
                {path.title}
              </h2>
              <ArrowRight size={18} className="text-text-muted group-hover:text-accent-gold transition-colors" />
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mb-4">{path.description}</p>
            <ol className="space-y-1.5">
              {path.articleSlugs.map((slug, i) => (
                <li key={slug} className="flex items-center gap-2.5 text-sm text-text-muted">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-bg-hover border border-border flex items-center justify-center text-[11px]">
                    {i + 1}
                  </span>
                  {titleOf(slug)}
                </li>
              ))}
            </ol>
          </Link>
        ))}
      </div>
    </div>
  )
}
