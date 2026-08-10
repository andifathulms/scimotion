import { getAllTags, getArticlesByTag } from '@/lib/articles'
import { ArticleCard } from '@/components/ArticleCard'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = { params: Promise<{ tag: string }> }

export async function generateStaticParams() {
  const tags = await getAllTags()
  return tags.map(({ tag }) => ({ tag }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  return {
    title: `#${decoded} — Scimotion`,
    description: `Interactive science articles tagged “${decoded}”.`,
  }
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  const articles = await getArticlesByTag(decoded)

  if (articles.length === 0) notFound()

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <Link href="/tags" className="text-xs text-text-muted hover:text-text-primary transition-colors">
        ← All tags
      </Link>
      <h1 className="text-3xl font-bold text-text-primary mt-3 mb-1">
        #{decoded}
      </h1>
      <p className="text-text-secondary text-sm mb-8">
        {articles.length} {articles.length === 1 ? 'article' : 'articles'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map(a => (
          <ArticleCard key={a.slug} article={a} />
        ))}
      </div>
    </div>
  )
}
