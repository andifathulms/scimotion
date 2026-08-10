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
      {/* scroll-mt clears the sticky 56px navbar, which was otherwise landing on
          top of the first thing the "Browse all" jump scrolled to. */}
      <div id="explore" className="scroll-mt-20 pb-16">
        <HomepageGrid articles={articles} />
      </div>
    </div>
  )
}
