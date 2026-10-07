import { getAllTags, getArticlesByTag } from '@/lib/articles'
import { ArticleCard } from '@/components/ArticleCard'
import { PageHeader } from '@/components/PageHeader'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'

type Props = { params: Promise<{ tag: string }> }

export async function generateStaticParams() {
  const tags = await getAllTags()
  return tags.map(({ tag }) => ({ tag }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  return pageMetadata({
    title: `#${decoded}`,
    description: `Interactive science articles tagged “${decoded}”.`,
    path: `/tags/${encodeURIComponent(decoded)}`,
  })
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  const articles = await getArticlesByTag(decoded)

  if (articles.length === 0) notFound()

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-14">
      <PageHeader
        back={{ href: '/tags', label: 'All tags' }}
        eyebrow="Tag"
        title={`#${decoded}`}
        meta={`${articles.length} ${articles.length === 1 ? 'article' : 'articles'}`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map(a => (
          <ArticleCard key={a.slug} article={a} />
        ))}
      </div>
    </div>
  )
}
