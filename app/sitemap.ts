import type { MetadataRoute } from 'next'
import { getAllArticles } from '@/lib/articles'
import { SITE_URL } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllArticles()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const articleRoutes: MetadataRoute.Sitemap = articles.map(a => ({
    url: `${SITE_URL}/articles/${a.slug}`,
    lastModified: new Date(a.date),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...articleRoutes]
}
