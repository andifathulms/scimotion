import { ArticleCard } from './ArticleCard'
import { rankRelated, type ArticleMeta } from '@/lib/articles'

export function RelatedPosts({
  current,
  allArticles,
}: {
  current: ArticleMeta
  allArticles: ArticleMeta[]
}) {
  const related = rankRelated(current, allArticles).slice(0, 3)

  if (related.length === 0) return null

  return (
    <div className="py-8">
      <h2 className="text-xl font-semibold text-text-primary mb-6">You might also like</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {related.map(article => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  )
}
