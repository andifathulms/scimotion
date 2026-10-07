import { getAllArticles } from '@/lib/articles'
import { learningPaths } from '@/lib/paths'

// The command palette's data, as one static file. Fetched the first time the
// palette opens rather than embedded in every page: the full list is ~40 KB,
// and most visits never press ⌘K.
export const dynamic = 'force-static'

export type SearchIndex = {
  articles: { slug: string; title: string; subtitle: string; topic: string; description: string; tags: string[]; readTime: number }[]
  paths: { slug: string; title: string; count: number }[]
}

export async function GET() {
  const articles = await getAllArticles()
  const body: SearchIndex = {
    articles: articles.map(({ slug, title, subtitle, topic, description, tags, readTime }) => ({
      slug, title, subtitle, topic, description, tags, readTime,
    })),
    paths: learningPaths.map(p => ({ slug: p.slug, title: p.title, count: p.articleSlugs.length })),
  }
  return Response.json(body)
}
