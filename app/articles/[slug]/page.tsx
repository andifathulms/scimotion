import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { ReadingProgress } from '@/components/ReadingProgress'
import { TopicBadge } from '@/components/TopicBadge'
import { ShareButtons } from '@/components/ShareButtons'
import { RelatedPosts } from '@/components/RelatedPosts'
import type { Metadata } from 'next'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
} from '@/components/ArticleAnimations'

const components = {
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
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
  return { title: `${meta.title} — Scimotion`, description: meta.description }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const { meta, content } = await getArticleBySlug(slug)
  const allArticles = await getAllArticles()
  const url = `https://scimotion.vercel.app/articles/${slug}`

  return (
    <>
      <ReadingProgress />
      <div className="max-w-[680px] mx-auto px-5 py-12">
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
        <div className="prose-article">
          <MDXRemote
            source={content}
            components={components}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkMath],
                rehypePlugins: [rehypeKatex],
              },
            }}
          />
        </div>

        <hr className="border-border mt-8" />

        <ShareButtons title={meta.title} url={url} />
        <RelatedPosts currentSlug={slug} currentTopic={meta.topic} allArticles={allArticles} />
      </div>
    </>
  )
}
