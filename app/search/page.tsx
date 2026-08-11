import { getAllArticles } from '@/lib/articles'
import { SearchClient } from '@/components/SearchClient'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Search',
  description:
    'Search interactive science articles across Mathematics, Physics, Chemistry, Biology, Earth & Climate, Astronomy & Cosmology, Computer Science, Networks & the Internet, and Medicine.',
  path: '/search',
})

export default async function SearchPage() {
  const articles = await getAllArticles()
  return <SearchClient articles={articles} />
}
