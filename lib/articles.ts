import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

export type ArticleMeta = {
  title: string
  subtitle: string
  topic: 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'
  slug: string
  date: string
  readTime: number
  featured: boolean
  description: string
}

export type Article = {
  meta: ArticleMeta
  content: string
}

const articlesDir = path.join(process.cwd(), 'content/articles')

export async function getAllArticles(): Promise<ArticleMeta[]> {
  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.mdx'))
  const articles = files.map(file => {
    const raw = fs.readFileSync(path.join(articlesDir, file), 'utf-8')
    const { data } = matter(raw)
    return data as ArticleMeta
  })
  return articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function getArticleBySlug(slug: string): Promise<Article> {
  const file = path.join(articlesDir, `${slug}.mdx`)
  const raw = fs.readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  return { meta: data as ArticleMeta, content }
}
