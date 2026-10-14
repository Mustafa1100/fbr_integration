import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import './App.css'
import { TARGET_COLUMNS, REQUIRED_COLUMNS } from './lib/targetSchema'
import {
  isCmpsaleFormat,
  convertCmpsaleRows,
  CMPSALE_REQUIRED_HEADERS,
  SETTINGS_ROW_FIELDS,
} from './lib/convertCmpsale'
import { validateRows } from './lib/validate'
import { loadSettings, saveSettings } from './lib/settingsStore'

const COLUMN_LABELS = {
  pos_invoice_no: 'Invoice #',
  invoice_date: 'Date',
  buyer_ntn_cnic: 'Buyer NTN/CNIC',
  buyer_name: 'Buyer Name',
  buyer_province: 'Province',
  buyer_address: 'Address',
  buyer_registration_type: 'Reg. Type',
  product_description: 'Product',
  hs_code: 'HS Code',
  rate: 'Rate',
  uom: 'UOM',
  quantity: 'Qty',
  unit_price: 'Unit Price',
  sale_type: 'Sale Type',
  scenario_id: 'Scenario',
  fixed_notified_value: 'Fixed Value',
  sro_schedule_no: 'SRO Schedule',
  sro_item_serial_no: 'SRO Serial',
  invoice_ref_no: 'Invoice Ref #',
  sales_tax: 'Sales Tax',
  sales_tax_withheld_at_source: 'ST Withheld',
  extra_tax: 'Extra Tax',
  further_tax: 'Further Tax',
  fed_payable: 'FED Payable',
  discount: 'Discount',
  total_values: 'Total Values',
  advance_tax: 'Advance Tax',
}

function downloadCsv(rows, filename) {
  const csv = Papa.unparse(rows, { columns: TARGET_COLUMNS })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(() => loadSettings())
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => saveSettings(settings), [settings])

  const issues = useMemo(() => (rows ? validateRows(rows) : []), [rows])
  const issueMap = useMemo(() => {
    const map = new Map()
    for (const issue of issues) {
      map.set(`${issue.rowIndex}:${issue.column}`, issue.message)
    }
    return map
  }, [issues])

  const invoiceCount = useMemo(() => {
    if (!rows) return 0
    return new Set(rows.map((r) => r.pos_invoice_no)).size
  }, [rows])

  function processFile(file) {
    setError('')
    setFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || []
        if (!isCmpsaleFormat(headers)) {
          setRows(null)
          setError(
            `This file's columns don't match the expected POS export format. ` +
              `Expected (at least) columns: ${CMPSALE_REQUIRED_HEADERS.join(', ')}. ` +
              `Found: ${headers.join(', ') || '(none)'}.`
          )
          return
        }
        const converted = convertCmpsaleRows(result.data, settings)
        setRows(converted)
      },
      error: (err) => {
        setRows(null)
        setError(`Could not read the file: ${err.message}`)
      },
    })
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function updateCell(rowIndex, column, value) {
    setRows((prev) => {
      const next = prev.slice()
      next[rowIndex] = { ...next[rowIndex], [column]: value }
      return next
    })
  }

  function applySettingsToAllRows() {
    setRows((prev) =>
      prev
        ? prev.map((row) => {
            const updates = {}
            for (const [settingKey, rowField] of Object.entries(SETTINGS_ROW_FIELDS)) {
              updates[rowField] = settings[settingKey]
            }
            return { ...row, ...updates }
          })
        : prev
    )
  }

  function reset() {
    setRows(null)
    setFileName('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const outputName = fileName
    ? fileName.replace(/\.csv$/i, '') + '_fbr_portal.csv'
    : 'converted_fbr_portal.csv'

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Convert POS Sales File → FBR Portal Format</h1>
        <p className="subtitle">
          Upload the sales export from your POS software and download a file ready to
          upload into the invoicing portal.
        </p>
      </header>

      {!rows && (
        <section
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            hidden
          />
          <div className="dropzone-icon">↑</div>
          <p>
            <strong>Click to choose a file</strong> or drag it here
          </p>
          <p className="muted">Accepts the .csv sales export from your POS software</p>
        </section>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      {rows && (
        <>
          <section className="panel settings-panel">
            <h2>Scenario defaults</h2>
            <p className="muted">
              Applied to every row below. These match FBR scenario SN025 (drugs sold at
              fixed ST rate, Eighth Schedule Table 1, Sr. 81) — change them if this batch
              is a different category.
            </p>
            <div className="settings-grid">
              <label>
                HS Code
                <input
                  value={settings.hsCode}
                  onChange={(e) => setSettings((s) => ({ ...s, hsCode: e.target.value }))}
                />
              </label>
              <label>
                Sale Type
                <input
                  value={settings.saleType}
                  onChange={(e) => setSettings((s) => ({ ...s, saleType: e.target.value }))}
                />
              </label>
              <label>
                Scenario ID
                <input
                  value={settings.scenarioId}
                  onChange={(e) => setSettings((s) => ({ ...s, scenarioId: e.target.value }))}
                />
              </label>
              <label>
                SRO Schedule No
                <input
                  value={settings.sroScheduleNo}
                  onChange={(e) => setSettings((s) => ({ ...s, sroScheduleNo: e.target.value }))}
                />
              </label>
              <label>
                SRO Item Serial No
                <input
                  value={settings.sroItemSerialNo}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, sroItemSerialNo: e.target.value }))
                  }
                />
              </label>
            </div>
            <button type="button" className="btn-secondary" onClick={applySettingsToAllRows}>
              Apply to all rows
            </button>
          </section>

          <section className="panel summary-bar">
            <div>
              <strong>{rows.length}</strong> line item{rows.length === 1 ? '' : 's'}
            </div>
            <div>
              <strong>{invoiceCount}</strong> invoice{invoiceCount === 1 ? '' : 's'}
            </div>
            <div className={issues.length ? 'issue-count has-issues' : 'issue-count'}>
              {issues.length ? `${issues.length} field(s) need attention` : 'All required fields look good'}
            </div>
            <div className="summary-actions">
              <button type="button" className="btn-secondary" onClick={reset}>
                Start over
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={issues.length > 0}
                onClick={() => downloadCsv(rows, outputName)}
                title={issues.length > 0 ? 'Fix the highlighted fields first' : 'Download'}
              >
                Download CSV
              </button>
            </div>
          </section>

          <section className="panel table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="line-no">#</th>
                    {TARGET_COLUMNS.map((col) => (
                      <th key={col} className={REQUIRED_COLUMNS.includes(col) ? 'required' : ''}>
                        {COLUMN_LABELS[col] || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="line-no">{row._sourceLine}</td>
                      {TARGET_COLUMNS.map((col) => {
                        const issue = issueMap.get(`${rowIndex}:${col}`)
                        return (
                          <td key={col} className={issue ? 'cell-error' : ''} title={issue || ''}>
                            <input
                              value={row[col] ?? ''}
                              onChange={(e) => updateCell(rowIndex, col, e.target.value)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default App
