import type { MetadataRoute } from 'next'
import { getAllArticles, getAllTags } from '@/lib/articles'
import { learningPaths } from '@/lib/paths'
import { SITE_URL } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllArticles()
  const tags = await getAllTags()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/learn`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/tags`, changeFrequency: 'monthly', priority: 0.4 },
  ]

  const pathRoutes: MetadataRoute.Sitemap = learningPaths.map(p => ({
    url: `${SITE_URL}/learn/${p.slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  const articleRoutes: MetadataRoute.Sitemap = articles.map(a => ({
    url: `${SITE_URL}/articles/${a.slug}`,
    lastModified: new Date(a.date),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  const tagRoutes: MetadataRoute.Sitemap = tags.map(({ tag }) => ({
    url: `${SITE_URL}/tags/${encodeURIComponent(tag)}`,
    changeFrequency: 'monthly',
    priority: 0.3,
  }))

  return [...staticRoutes, ...pathRoutes, ...articleRoutes, ...tagRoutes]
}
