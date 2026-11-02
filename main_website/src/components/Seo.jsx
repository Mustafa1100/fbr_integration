import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { seoFor, siteUrl } from '../data/seo'

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

// Keeps the title, description and canonical link in sync while the visitor
// navigates. The first load already has them baked in by scripts/prerender.js.
export default function Seo() {
  const { pathname } = useLocation()
  useEffect(() => {
    const page = seoFor(pathname)
    const url = siteUrl + (page.path || pathname)
    document.title = page.title
    setMeta('meta[name="description"]', 'content', page.description)
    setMeta('meta[property="og:title"]', 'content', page.title)
    setMeta('meta[property="og:description"]', 'content', page.description)
    setMeta('meta[property="og:url"]', 'content', url)
    setMeta('link[rel="canonical"]', 'href', url)
    setMeta('meta[name="robots"]', 'content', page.notFound ? 'noindex' : 'index, follow')
  }, [pathname])
  return null
}
