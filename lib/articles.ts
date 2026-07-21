import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { TOPICS, type Topic } from './topics'

export { TOPICS, type Topic }

export type QuizQuestion = {
  q: string
  options: string[]
  answer: number
  explanation: string
}

export type ArticleMeta = {
  title: string
  subtitle: string
  topic: Topic
  slug: string
  date: string
  readTime: number
  featured: boolean
  description: string
  tags: string[]
}

export type Article = {
  meta: ArticleMeta
  content: string
  quiz: QuizQuestion[]
}

const articlesDir = path.join(process.cwd(), 'content/articles')

const REQUIRED_FIELDS = ['title', 'subtitle', 'topic', 'slug', 'date', 'readTime', 'description'] as const

// Frontmatter is untyped YAML, so the topic has to be checked at runtime. This
// used to be an unchecked cast, which meant a typo produced an article that
// built fine but rendered an unstyled badge and no hero accent.
function normalizeTopic(value: unknown, file: string): Topic {
  if (!TOPICS.includes(value as Topic)) {
    throw new Error(
      `Article "${file}" has an unknown topic: ${JSON.stringify(value)}. Expected one of: ${TOPICS.join(', ')}`
    )
  }
  return value as Topic
}

function normalizeMeta(data: Record<string, unknown>, file: string): ArticleMeta {
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Article "${file}" is missing required frontmatter field: ${field}`)
    }
  }
  return {
    title: data.title as string,
    subtitle: data.subtitle as string,
    topic: normalizeTopic(data.topic, file),
    slug: data.slug as string,
    date: data.date as string,
    readTime: data.readTime as number,
    featured: Boolean(data.featured),
    description: data.description as string,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
  }
}

export async function getAllArticles(): Promise<ArticleMeta[]> {
  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.mdx'))
  const articles = files.map(file => {
    const raw = fs.readFileSync(path.join(articlesDir, file), 'utf-8')
    const { data } = matter(raw)
    return normalizeMeta(data, file)
  })
  return articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function getArticleBySlug(slug: string): Promise<Article> {
  const file = path.join(articlesDir, `${slug}.mdx`)
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const quiz = Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : []
  return { meta: normalizeMeta(data, `${slug}.mdx`), content, quiz }
}

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const articles = await getAllArticles()
  const counts = new Map<string, number>()
  for (const a of articles) {
    for (const tag of a.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export async function getArticlesByTag(tag: string): Promise<ArticleMeta[]> {
  const articles = await getAllArticles()
  return articles.filter(a => a.tags.includes(tag))
}

// Rank other articles by shared tags first, then same topic, for "related" lists.
export function rankRelated(current: ArticleMeta, all: ArticleMeta[]): ArticleMeta[] {
  return all
    .filter(a => a.slug !== current.slug)
    .map(a => {
      const sharedTags = a.tags.filter(t => current.tags.includes(t)).length
      const sameTopic = a.topic === current.topic ? 1 : 0
      return { a, score: sharedTags * 10 + sameTopic }
    })
    .sort((x, y) => y.score - x.score || new Date(y.a.date).getTime() - new Date(x.a.date).getTime())
    .map(x => x.a)
}
