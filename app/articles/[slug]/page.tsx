import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { ReadingProgress } from '@/components/ReadingProgress'
import { TopicBadge } from '@/components/TopicBadge'
import { ShareButtons } from '@/components/ShareButtons'
import { RelatedPosts } from '@/components/RelatedPosts'
import { TagList } from '@/components/TagList'
import { TableOfContents } from '@/components/TableOfContents'
import { extractHeadings, rehypeSlugSimple } from '@/lib/toc'
import type { Metadata } from 'next'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { ProseAnimator } from '@/components/ProseAnimator'
import { SITE_URL } from '@/lib/site'
import {
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
  FourierPhasesAnimation,
  SievePrimeGapAnimation,
  SortingComplexityAnimation,
  TaylorAnimation,
  PendulumAnimation,
  BinarySearchAnimation,
  ActionPotentialAnimation,
  NewtonMethodAnimation,
  EulersFormulaAnimation,
  TimeDilationAnimation,
  GraphTraversalAnimation,
  BrownianMotionAnimation,
  CLTAnimation,
} from '@/components/ArticleAnimations'

const components = {
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
  FourierPhasesAnimation,
  SievePrimeGapAnimation,
  SortingComplexityAnimation,
  TaylorAnimation,
  PendulumAnimation,
  BinarySearchAnimation,
  ActionPotentialAnimation,
  NewtonMethodAnimation,
  EulersFormulaAnimation,
  TimeDilationAnimation,
  GraphTraversalAnimation,
  BrownianMotionAnimation,
  CLTAnimation,
}

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { meta } = await getArticleBySlug(slug)
  const title = `${meta.title} — Scimotion`
  return {
    title,
    description: meta.description,
    alternates: { canonical: `${SITE_URL}/articles/${slug}` },
    openGraph: {
      type: 'article',
      title,
      description: meta.description,
      url: `${SITE_URL}/articles/${slug}`,
      siteName: 'Scimotion',
      publishedTime: meta.date,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const { meta, content } = await getArticleBySlug(slug)
  const allArticles = await getAllArticles()
  const url = `${SITE_URL}/articles/${slug}`
  const headings = extractHeadings(content)

  return (
    <>
      <ReadingProgress />
      <div className="max-w-[1100px] mx-auto px-5 py-12 flex justify-center gap-10">
        <aside className="hidden xl:block w-56 shrink-0">
          <div className="sticky top-20">
            <TableOfContents headings={headings} />
          </div>
        </aside>
        <article className="w-full max-w-[680px]">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4">
            <TopicBadge topic={meta.topic} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2" style={{ letterSpacing: '-0.3px' }}>
            {meta.title}
          </h1>
          <p className="text-text-secondary text-base mb-4">{meta.subtitle}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted uppercase tracking-wider">
            <span>{meta.readTime} min read</span>
            <span>·</span>
            <span>{new Date(meta.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        <hr className="border-border mb-8" />

        {/* Body */}
        <ProseAnimator />
        <div className="prose-article">
          <MDXRemote
            source={content}
            components={components}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkMath],
                rehypePlugins: [rehypeSlugSimple, rehypeKatex],
              },
            }}
          />
        </div>

        <hr className="border-border mt-8" />

        <div className="mt-8">
          <TagList tags={meta.tags} />
        </div>

        <ShareButtons title={meta.title} url={url} />
        <RelatedPosts current={meta} allArticles={allArticles} />
        </article>
        <div className="hidden xl:block w-56 shrink-0" aria-hidden="true" />
      </div>
    </>
  )
}
