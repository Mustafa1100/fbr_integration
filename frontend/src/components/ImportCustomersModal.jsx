import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud, X } from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'

// Download the empty customer list (Excel) — also used by the page button.
export async function downloadCustomersTemplate() {
  const resp = await api.getRaw('/api/customers/template')
  const url = URL.createObjectURL(await resp.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = 'customers_template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

// Add many customers from a list. The file is checked as soon as it is
// chosen; Import saves all of them, or none if any row has a problem.
export default function ImportCustomersModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [check, setCheck] = useState(null) // null | 'checking' | { ok, errors, summary }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const seq = useRef(0)

  async function choose(f) {
    const n = ++seq.current
    setFile(f || null)
    setError('')
    setCheck(f ? 'checking' : null)
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const result = await api.upload('/api/customers/import/check', fd)
      if (n === seq.current) setCheck(result)
    } catch (e) {
      if (n === seq.current) {
        setCheck(null)
        setError(e.message)
      }
    }
  }

  function clear(e) {
    e.stopPropagation()
    seq.current += 1
    setFile(null)
    setCheck(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function importNow() {
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await api.upload('/api/customers/import', fd)
      if (result.created > 0) onImported(result.created)
      else setCheck(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const ready = check && check !== 'checking' && check.ok

  return (
    <Modal title="Import customers" onClose={onClose} width={560}>
      <p className="hint" style={{ marginTop: 0 }}>
        Add many customers at once from an Excel or CSV list, one customer per row. Only Buyer Name
        is required.{' '}
        <button type="button" className="link-button" onClick={() => downloadCustomersTemplate().catch((e) => setError(e.message))}>
          Download the template
        </button>
      </p>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div
        className={`dropzone${file ? ' has-file' : ''}${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (!f || !inputRef.current) return
          const dt = new DataTransfer()
          dt.items.add(f)
          inputRef.current.files = dt.files
          choose(f)
        }}
      >
        <input
          type="file"
          accept=".xlsx,.csv"
          ref={inputRef}
          className="dropzone-input"
          onChange={(e) => choose(e.target.files[0])}
        />
        {file ? (
          <>
            <FileText size={20} />
            <span className="dropzone-text">
              <strong>{file.name}</strong>
            </span>
            <button type="button" className="btn btn-ghost btn-sm dropzone-remove" onClick={clear}>
              <X size={14} /> Remove
            </button>
          </>
        ) : (
          <>
            <UploadCloud size={22} />
            <span className="dropzone-text">
              <strong>Click to choose a file</strong> or drag and drop it here
            </span>
          </>
        )}
      </div>

      {check === 'checking' && (
        <p className="hint file-check">
          <Loader2 size={14} className="spin" /> Checking file…
        </p>
      )}
      {check && check !== 'checking' && check.ok && (
        <div className="alert ok file-check">
          <CheckCircle2 size={17} />
          <span>
            <strong>File checked:</strong> {plural(check.summary.customers, 'customer')} ready to add (
            {check.summary.registered} registered, {check.summary.unregistered} unregistered).
          </span>
        </div>
      )}
      {check && check !== 'checking' && !check.ok && (
        <div className="alert error file-check">
          <AlertCircle size={17} />
          <div>
            <strong>This list can&apos;t be imported yet. No customers have been saved.</strong>
            <ul style={{ marginTop: 6 }}>
              {check.errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <p style={{ margin: '10px 0 0' }}>Fix these and choose the file again.</p>
          </div>
        </div>
      )}

      <div className="row-actions" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={importNow}>
          {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />}{' '}
          {ready ? `Import ${plural(check.summary.customers, 'customer')}` : 'Import'}
        </button>
      </div>
    </Modal>
  )
}
