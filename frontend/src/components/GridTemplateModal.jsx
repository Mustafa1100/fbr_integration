import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ChevronDown, ChevronUp, Download, Loader2, Search } from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'

const STORE_KEY = 'gridTemplateChoice'

// How the server compares names: case and extra spaces don't matter.
const nameKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()

function loadChoice() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return { ids: Array.isArray(v.ids) ? v.ids : [], customers: v.customers !== false }
  } catch {
    return { ids: [], customers: true }
  }
}

function saveChoice(choice) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(choice))
  } catch {
    // Not remembered — fine.
  }
}

// "Download template": pick saved products (columns in the order ticked)
// and optionally fill in saved customer names, then get an Excel file whose
// headings are spelled exactly like the saved records.
export default function GridTemplateModal({ onClose, onStandardTemplate }) {
  const [products, setProducts] = useState(null)
  const [picked, setPicked] = useState([]) // product ids, in the order ticked
  const [withCustomers, setWithCustomers] = useState(true)
  const [q, setQ] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/products')
      .then((list) => {
        setProducts(list)
        const saved = loadChoice()
        const ids = new Set(list.map((p) => p.id))
        setPicked(saved.ids.filter((id) => ids.has(id)))
        setWithCustomers(saved.customers)
      })
      .catch((e) => setError(e.message))
  }, [])

  // A name used by two products can't be told apart in a file.
  const duplicate = useMemo(() => {
    const counts = {}
    for (const p of products || []) counts[nameKey(p.description)] = (counts[nameKey(p.description)] || 0) + 1
    return (p) => counts[nameKey(p.description)] > 1
  }, [products])

  const byId = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products])
  // "Show selected only" lists the ticked products in column order, where
  // they can be moved up / down.
  const base = selectedOnly ? picked.map((id) => byId.get(id)).filter(Boolean) : products || []
  const shown = base.filter((p) => nameKey(p.description).includes(nameKey(q)))

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  function move(id, step) {
    setPicked((cur) => {
      const i = cur.indexOf(id)
      const j = i + step
      if (i < 0 || j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // Ticks every product currently listed (all, or the search matches).
  function selectAllShown() {
    const ids = shown.filter((p) => !duplicate(p)).map((p) => p.id)
    setPicked((cur) => [...cur, ...ids.filter((id) => !cur.includes(id))])
  }

  async function download() {
    setBusy(true)
    setError('')
    try {
      saveChoice({ ids: picked, customers: withCustomers })
      const params = new URLSearchParams({ products: picked.join(','), customers: String(withCustomers) })
      const resp = await api.getRaw(`/api/uploads/grid-template?${params}`)
      const url = URL.createObjectURL(await resp.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'invoice_template_products.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Download template" onClose={onClose} width={560}>
      <div className="pick-modal">
      <p className="hint" style={{ marginTop: 0 }}>
        Tick the products to include. Each row of the file is one invoice: enter the date, invoice
        number, buyer name and the number of packs. Blank or 0 packs = not on that invoice.
      </p>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {products === null ? (
        <p className="hint">
          <Loader2 size={14} className="spin" /> Loading products…
        </p>
      ) : products.length === 0 ? (
        <div className="alert info">
          <AlertCircle size={17} />
          <span>
            You have no saved products yet. <Link to="/products">Add them on the Products page</Link>{' '}
            first.
          </span>
        </div>
      ) : (
        <>
          <div className="row-actions" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div className="input-wrap" style={{ flex: '1 1 200px' }}>
              <Search size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllShown}>
              Select all
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
          <div className="pick-bar">
            <span>
              <strong>{picked.length}</strong> of {products.length} selected
            </span>
            <label className="pick-switch">
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(e) => setSelectedOnly(e.target.checked)}
              />
              <span className="pick-switch-track" aria-hidden="true" />
              Show selected only
            </label>
          </div>
          <div className="grid-pick-list">
            {shown.map((p) => {
              const dup = duplicate(p)
              const order = picked.indexOf(p.id)
              return (
                <label key={p.id} className={`pick-row${dup ? ' disabled' : ''}${order >= 0 ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={order >= 0}
                    disabled={dup}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="pick-name">
                    {p.description}
                    {dup && <small>Another product has this name. Rename one to use it.</small>}
                  </span>
                  {order >= 0 && <span className="pick-col">Column {order + 4}</span>}
                  {selectedOnly && (
                    <span className="pick-move">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={order <= 0}
                        onClick={(e) => {
                          e.preventDefault()
                          move(p.id, -1)
                        }}
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={order === picked.length - 1}
                        onClick={(e) => {
                          e.preventDefault()
                          move(p.id, 1)
                        }}
                      >
                        <ChevronDown size={15} />
                      </button>
                    </span>
                  )}
                </label>
              )
            })}
            {shown.length === 0 && (
              <p className="hint pick-empty">
                {selectedOnly && picked.length === 0 ? 'Nothing selected yet.' : 'No products match.'}
              </p>
            )}
          </div>
          <label className="pick-row pick-option">
            <input type="checkbox" checked={withCustomers} onChange={(e) => setWithCustomers(e.target.checked)} />
            <span className="pick-name">Fill in my saved customer names (one per row)</span>
          </label>
        </>
      )}

      <div className="pick-footer">
        <button type="button" className="link-button" onClick={onStandardTemplate}>
          Download the full-column template instead
        </button>
        <div className="pick-buttons">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || picked.length === 0}
            onClick={download}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Download (
            {picked.length} product{picked.length === 1 ? '' : 's'})
          </button>
        </div>
      </div>
      </div>
    </Modal>
  )
}
