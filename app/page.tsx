import { getAllArticles } from '@/lib/articles'
import { HomepageGrid } from '@/components/HomepageGrid'

export default async function HomePage() {
  const articles = await getAllArticles()
  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-text-primary tracking-tight mb-3" style={{ letterSpacing: '-0.5px' }}>
          Science you can see move.
        </h1>
        <p className="text-text-secondary text-lg">
          Every article explains a concept, then hands you the controls.
        </p>
      </div>
      <HomepageGrid articles={articles} />
    </div>
  )
}
