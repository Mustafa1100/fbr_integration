import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export const PAGE_SIZES = [10, 25, 50]

// Pager for a list. `page` is zero-based. Shown whenever the list has rows,
// so the count and the rows-per-page choice are always at hand; the arrow
// buttons simply disable themselves when there is nowhere to go.
export default function Pagination({ page, pageSize, total, onPage, onPageSize, label = 'rows' }) {
  if (!total) return null
  const pages = Math.max(Math.ceil(total / pageSize), 1)
  const first = page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, total)
  const atStart = page <= 0
  const atEnd = page >= pages - 1

  return (
    <nav className="pager" aria-label={`Pages of ${label}`}>
      <span className="pager-count" aria-live="polite">
        Showing {first}–{last} of {total} {label}
      </span>
      <label className="pager-size">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="pager-buttons">
        <button type="button" className="icon-btn" onClick={() => onPage(0)} disabled={atStart} aria-label="First page" title="First page">
          <ChevronsLeft size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => onPage(page - 1)} disabled={atStart} aria-label="Previous page" title="Previous page">
          <ChevronLeft size={18} />
        </button>
        <span className="pager-page">
          Page {page + 1} of {pages}
        </span>
        <button type="button" className="icon-btn" onClick={() => onPage(page + 1)} disabled={atEnd} aria-label="Next page" title="Next page">
          <ChevronRight size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => onPage(pages - 1)} disabled={atEnd} aria-label="Last page" title="Last page">
          <ChevronsRight size={18} />
        </button>
      </div>
    </nav>
  )
}
