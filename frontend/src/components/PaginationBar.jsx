import { ChevronLeft, ChevronRight } from 'lucide-react'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// Shared "flexible" pagination footer — a per-page size selector plus
// Prev/Next — used everywhere a table is server-paginated (Users, Admins,
// Uploads, Invoices, on both the user and admin dashboards).
export default function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = 'items',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="pagination-bar">
      <span className="muted">
        Showing {rangeStart}–{rangeEnd} of {total} {itemLabel}
      </span>
      <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <label className="row-actions" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            Per page
          </span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{ width: 76 }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
          Page {page} of {totalPages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
