import type { Metadata } from 'next'
import { getAllArticles, getTopicCounts } from '@/lib/articles'
import { pageMetadata } from '@/lib/metadata'
import { SITE_NAME } from '@/lib/site'
import { learningPaths } from '@/lib/paths'
import { HomepageGrid } from '@/components/HomepageGrid'
import { Hero } from '@/components/Hero'

// Built from the same counts the Hero prints, so the preview cannot claim a
// different-sized library than the page shows.
export async function generateMetadata(): Promise<Metadata> {
  const [articles, counts] = await Promise.all([getAllArticles(), getTopicCounts()])
  const fields = counts.filter(t => t.count > 0).length
  return pageMetadata({
    title: `${SITE_NAME} — Science you can play with`,
    description:
      `${articles.length} interactive science explainers across ${fields} fields. Read the concept, ` +
      'then drag the sliders and watch the model respond — every article ships with two hand-built widgets.',
    path: '',
  })
}

export default async function HomePage() {
  const [articles, counts] = await Promise.all([getAllArticles(), getTopicCounts()])

  return (
    <div className="max-w-[1100px] mx-auto px-5">
      {/* The hero carries the worked demo beside the headline. The landing
          view used to describe the product and only then show it. */}
      <Hero
        articleCount={articles.length}
        widgetCount={articles.reduce((n, a) => n + a.widgets, 0)}
        fieldCount={counts.filter(t => t.count > 0).length}
        pathCount={learningPaths.length}
      />
      {/* scroll-mt clears the sticky 56px navbar, which was otherwise landing on
          top of the first thing the "Browse all" jump scrolled to. */}
      <div id="explore" className="scroll-mt-20 pb-16 pt-8">
        <HomepageGrid articles={articles} />
      </div>
    </div>
  )
}
