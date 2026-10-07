import { learningPaths, dominantTopic } from '@/lib/paths'
import { getAllArticles } from '@/lib/articles'
import { topicVar } from '@/lib/topics'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'
import { PageHeader } from '@/components/PageHeader'
import { PathCard } from '@/components/PathCard'

export const metadata: Metadata = pageMetadata({
  title: 'Learning Paths',
  description: 'Curated, ordered reading sequences that build concepts from the ground up.',
  path: '/learn',
})

export default async function LearnPage() {
  const articles = await getAllArticles()
  const totalMinutes = articles.reduce((n, a) => n + a.readTime, 0)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-14">
      <PageHeader
        eyebrow="Learning paths"
        title="Follow a syllabus"
        description="Curated sequences that build understanding step by step. Follow one from start to finish, or dip into any article along the way."
        meta={`${learningPaths.length} paths · ${articles.length} articles · about ${Math.round(totalMinutes / 60)} hours of reading`}
      />

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        {learningPaths.map(path => {
          const items = path.articleSlugs
            .map(slug => articles.find(a => a.slug === slug))
            .filter((a): a is NonNullable<typeof a> => Boolean(a))
          const topic = dominantTopic(items)
          return (
            <PathCard
              key={path.slug}
              slug={path.slug}
              title={path.title}
              description={path.description}
              accent={topic ? topicVar(topic) : 'var(--color-accent-gold)'}
              steps={items.map(a => ({ slug: a.slug, title: a.title, readTime: a.readTime }))}
            />
          )
        })}
      </div>
    </div>
  )
}
