import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api, formatDateTime, money } from '../api.js'
import Modal from './Modal.jsx'
import Pagination, { PAGE_SIZES } from './Pagination.jsx'

// The client's invoices as backed up by their computer. Read-only: invoices
// are only ever made on the POS computer.

const RETURN = 3
const FILTERS = [
  { id: '', label: 'All' },
  { id: 'fiscalized', label: 'Accepted' },
  { id: 'queued', label: 'Waiting for FBR' },
  { id: 'unconfirmed', label: 'Unconfirmed' },
  { id: 'failed', label: 'Failed' },
]
const STATUS = {
  fiscalized: ['Accepted', 'active'],
  queued: ['Waiting for FBR', 'expiring'],
  unconfirmed: ['Unconfirmed', 'expired'],
  failed: ['Failed', 'expired'],
}
// FBR's payment mode codes.
const PAYMENT = { 1: 'Cash', 2: 'Card', 3: 'Gift voucher', 4: 'Loyalty card', 5: 'Mixed', 6: 'Cheque' }

// Invoice times are Pakistan time as printed on the receipt.
const invoiceTime = (text) => (text ? formatDateTime(`${text.replace(' ', 'T')}+05:00`) : 'N/A')
const signedTotal = (inv) => (inv.invoice_type === RETURN ? `−${money(inv.total_bill)}` : money(inv.total_bill))

function StatusBadge({ invoice }) {
  const [label, tone] = STATUS[invoice.status] || [invoice.status, '']
  return (
    <>
      <span className={`badge ${tone}`} title={invoice.last_error || undefined}>
        {label}
      </span>
      {invoice.mode === 'demo' && <span className="badge expiring">Demo</span>}
    </>
  )
}

export default function ClientInvoices({ clientId }) {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        status,
        search: search.trim(),
        offset: String(page * pageSize),
        limit: String(pageSize),
      })
      setData(await api.get(`/api/admin/clients/${clientId}/invoices?${query}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, status, search, page, pageSize])

  useEffect(() => {
    // A short pause while typing in the search box.
    const timer = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const view = async (invoice) => {
    setError('')
    try {
      setOpen(await api.get(`/api/admin/clients/${clientId}/invoices/${invoice.id}`))
    } catch (err) {
      setError(err.message)
    }
  }

  const summary = data?.summary
  const attention = summary
    ? (summary.by_status.queued || 0) + (summary.by_status.unconfirmed || 0) + (summary.by_status.failed || 0)
    : 0

  return (
    <section className="card">
      <div className="page-head">
        <h2>Invoices</h2>
        <button type="button" className="btn ghost" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="muted">
        Backed up automatically from the client&apos;s computer after every sale, and whenever it
        comes back online. Times are Pakistan time.
      </p>

      {summary && (
        <div className="stat-row">
          <div className="stat">
            <span>Sales today</span>
            <strong>{summary.today.sales}</strong>
            {summary.today.returns > 0 && <span>{summary.today.returns} returned</span>}
          </div>
          <div className="stat">
            <span>Net today</span>
            <strong>Rs {money(summary.today.net)}</strong>
          </div>
          <div className={`stat ${attention ? 'attention' : ''}`}>
            <span>Not accepted by FBR yet</span>
            <strong>{attention}</strong>
          </div>
          <div className="stat">
            <span>Last invoice</span>
            <strong className="stat-small">{invoiceTime(summary.last_invoice_at)}</strong>
            <span>{summary.total} in total</span>
          </div>
          <div className="stat">
            <span>Last backup</span>
            <strong className="stat-small">{formatDateTime(summary.last_backup_at)}</strong>
          </div>
        </div>
      )}

      <div className="page-head">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`tab ${status === f.id ? 'active' : ''}`}
              onClick={() => {
                setStatus(f.id)
                setPage(0)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Invoice no., FBR no. or buyer"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
          />
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="table-card inner">
        <table className="stack-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Buyer</th>
              <th>Payment</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>FBR invoice number</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((inv) => (
              <tr key={inv.id} className="clickable" onClick={() => view(inv)} title="View invoice">
                <td className="mono" data-label="Invoice">
                  {inv.usin}
                  {inv.invoice_type === RETURN && <span className="badge spaced">Return of {inv.ref_usin}</span>}
                </td>
                <td data-label="Date">{invoiceTime(inv.created_at)}</td>
                <td data-label="Buyer">{inv.buyer_name || 'N/A'}</td>
                <td data-label="Payment">{PAYMENT[inv.payment_mode] || 'N/A'}</td>
                <td className={`num ${inv.invoice_type === RETURN ? 'negative' : ''}`} data-label="Total">
                  {signedTotal(inv)}
                </td>
                <td data-label="Status">
                  <StatusBadge invoice={inv} />
                </td>
                <td className="mono" data-label="FBR invoice number">{inv.fbr_invoice_number || 'N/A'}</td>
              </tr>
            ))}
            {data && !data.rows.length && (
              <tr>
                <td colSpan={7} className="muted empty">
                  {status || search ? 'No invoices match.' : 'No invoices backed up yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total || 0}
        label="invoices"
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size)
          setPage(0)
        }}
      />

      {open && (
        <Modal title={`Invoice ${open.usin}`} onClose={() => setOpen(null)} width={640}>
          <dl className="facts">
            <div className="fact">
              <dt>Date</dt>
              <dd>{invoiceTime(open.created_at)}</dd>
            </div>
            <div className="fact">
              <dt>Status</dt>
              <dd>
                <StatusBadge invoice={open} />
              </dd>
            </div>
            <div className="fact">
              <dt>FBR invoice number</dt>
              <dd className="mono">{open.fbr_invoice_number || 'N/A'}</dd>
            </div>
            <div className="fact">
              <dt>POS ID</dt>
              <dd className="mono">{open.pos_id || 'N/A'}</dd>
            </div>
            {open.invoice_type === RETURN && (
              <div className="fact">
                <dt>Return of</dt>
                <dd className="mono">{open.ref_usin}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Buyer</dt>
              <dd>
                {[open.buyer_name, open.buyer_cnic && `CNIC ${open.buyer_cnic}`, open.buyer_ntn && `NTN ${open.buyer_ntn}`, open.buyer_phone]
                  .filter(Boolean)
                  .join(' · ') || 'N/A'}
              </dd>
            </div>
            <div className="fact">
              <dt>Payment</dt>
              <dd>{PAYMENT[open.payment_mode] || 'N/A'}</dd>
            </div>
            {open.last_error && open.status !== 'fiscalized' && (
              <div className="fact">
                <dt>Last error</dt>
                <dd>{open.last_error}</dd>
              </div>
            )}
          </dl>
          <div className="table-card inner">
            <table className="stack-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>PCT code</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Tax</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {open.items.map((line, index) => (
                  <tr key={index}>
                    <td data-label="Item">{line.item_name}</td>
                    <td className="mono" data-label="PCT code">{line.pct_code || 'N/A'}</td>
                    <td className="num" data-label="Qty">{line.quantity}</td>
                    <td className="num" data-label="Price">{money(line.unit_price)}</td>
                    <td className="num" data-label="Tax">
                      {money(line.tax_charged)} ({line.tax_rate}%)
                    </td>
                    <td className="num" data-label="Total">{money(line.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="facts totals">
            <div className="fact">
              <dt>Sale value</dt>
              <dd>Rs {money(open.total_sale_value)}</dd>
            </div>
            <div className="fact">
              <dt>Tax</dt>
              <dd>Rs {money(open.total_tax + open.total_further_tax)}</dd>
            </div>
            {open.total_discount > 0 && (
              <div className="fact">
                <dt>Discount</dt>
                <dd>Rs {money(open.total_discount)}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Total</dt>
              <dd>
                <strong>Rs {signedTotal(open)}</strong>
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </section>
  )
}
