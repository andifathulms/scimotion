import { getPathNav } from '@/lib/paths'
import type { ArticleMeta } from '@/lib/articles'
import { UpNext } from './UpNext'

// The foot of an article inside a learning path. It used to be two equal
// prev/next boxes; the next article is the thing a reader who just finished
// wants, so it is now the large target, with the route and their quiz result
// above it and "previous" demoted to a line underneath.
//
// This half resolves titles on the server, so the client component receives
// only the handful of strings it renders, not the whole article list.
export function PathNav({ slug, allArticles }: { slug: string; allArticles: ArticleMeta[] }) {
  const nav = getPathNav(slug)
  if (!nav) return null

  const find = (s: string) => allArticles.find(a => a.slug === s)
  const titleOf = (s: string) => find(s)?.title ?? s
  const { path, index, prevSlug, nextSlug } = nav
  const next = nextSlug ? find(nextSlug) : undefined

  return (
    <UpNext
      slug={slug}
      pathSlug={path.slug}
      pathTitle={path.title}
      index={index}
      steps={path.articleSlugs.map(s => ({ slug: s, title: titleOf(s) }))}
      prev={prevSlug ? { slug: prevSlug, title: titleOf(prevSlug) } : null}
      next={
        next
          ? { slug: next.slug, title: next.title, description: next.description, topic: next.topic, readTime: next.readTime }
          : null
      }
    />
  )
}
