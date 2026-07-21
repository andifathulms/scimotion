/** @type {import('next').NextConfig} */

// Deployed to GitHub Pages as a *project* page, so everything is served under
// /scimotion. basePath makes next/link and asset URLs resolve there; without it
// every CSS/JS request 404s. Set NEXT_PUBLIC_BASE_PATH='' to build for a root
// deploy (custom domain or user site) without editing this file.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/scimotion'

const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],

  // Fully static export — the site has no server dependencies.
  output: 'export',

  // Emit directory/index.html rather than bare .html files, which is the layout
  // GitHub Pages resolves most predictably.
  trailingSlash: true,

  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
}

export default nextConfig
