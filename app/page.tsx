import { getAllArticles } from '@/lib/articles'
import { HomepageGrid } from '@/components/HomepageGrid'
import { Hero } from '@/components/Hero'

export default async function HomePage() {
  const articles = await getAllArticles()
  return (
    <div className="max-w-[1100px] mx-auto px-5">
      <Hero />
      <div id="topics" className="pb-16">
        <HomepageGrid articles={articles} />
      </div>
    </div>
  )
}
