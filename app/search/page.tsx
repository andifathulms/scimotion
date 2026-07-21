import { getAllArticles } from '@/lib/articles'
import { SearchClient } from '@/components/SearchClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Search — Scimotion',
  description: 'Search interactive science articles across Mathematics, Physics, Chemistry, Biology, Earth & Climate, Computer Science, and Medicine.',
}

export default async function SearchPage() {
  const articles = await getAllArticles()
  return <SearchClient articles={articles} />
}
