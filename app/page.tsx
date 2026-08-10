import { getAllArticles, getTopicCounts } from '@/lib/articles'
import { learningPaths } from '@/lib/paths'
import { HomepageGrid } from '@/components/HomepageGrid'
import { Hero } from '@/components/Hero'

export default async function HomePage() {
  const [articles, counts] = await Promise.all([getAllArticles(), getTopicCounts()])

  return (
    <div className="max-w-[1100px] mx-auto px-5">
      <Hero
        articleCount={articles.length}
        fieldCount={counts.filter(t => t.count > 0).length}
        pathCount={learningPaths.length}
      />
      <div id="explore" className="pb-16">
        <HomepageGrid articles={articles} />
      </div>
    </div>
  )
}
