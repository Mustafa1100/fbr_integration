// Runs after `vite build` (client) and `vite build --ssr` (server entry).
// For every page in src/data/seo.js it writes dist/<path>.html with the
// page's real content, title, description and canonical URL already in the
// HTML, so search engines can read it without running JavaScript.
// Also writes dist/404.html and dist/sitemap.xml.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const ssrDir = path.join(root, 'dist-ssr')

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href)
const { pages, notFoundPage, siteUrl } = await import(
  pathToFileURL(path.join(root, 'src/data/seo.js')).href
)

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function page(url, { title, description }, { canonical, noindex = false } = {}) {
  let html = template
    .replace('<!--app-html-->', render(url))
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`)
  if (canonical) {
    html = html
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`)
  } else {
    html = html.replace(/\s*<link rel="canonical"[^>]*>/, '')
  }
  if (noindex) html = html.replace('content="index, follow"', 'content="noindex"')
  return html
}

for (const p of pages) {
  const canonical = siteUrl + (p.path === '/' ? '/' : p.path)
  // /about → dist/about.html (not about/index.html): Cloudflare serves it at
  // /about with no trailing-slash redirect, matching the canonical URL.
  const file = p.path === '/' ? path.join(dist, 'index.html') : path.join(dist, `${p.path}.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, page(p.path, p, { canonical }))
  console.log('prerendered', p.path)
}

fs.writeFileSync(path.join(dist, '404.html'), page('/404', notFoundPage, { noindex: true }))
console.log('prerendered 404.html')

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${siteUrl}${p.path === '/' ? '/' : p.path}</loc>
    <lastmod>${today}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>
`
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)
console.log('wrote sitemap.xml')

fs.rmSync(ssrDir, { recursive: true, force: true })
