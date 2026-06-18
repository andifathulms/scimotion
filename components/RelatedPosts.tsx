import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'

export function RelatedPosts({
  currentSlug,
  currentTopic,
  allArticles,
}: {
  currentSlug: string
  currentTopic: string
  allArticles: ArticleMeta[]
}) {
  const others = allArticles.filter(a => a.slug !== currentSlug)
  const sameTopicFirst = [
    ...others.filter(a => a.topic === currentTopic),
    ...others.filter(a => a.topic !== currentTopic),
  ].slice(0, 3)

  if (sameTopicFirst.length === 0) return null

  return (
    <div className="py-8">
      <h2 className="text-base font-semibold text-text-primary mb-6">You might also like</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sameTopicFirst.map(article => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  )
}
