import { BookOpenText, Info, AlertTriangle } from 'lucide-react'
import { COLUMNS, SALE_TYPES } from '../data/columnGuide'

// scope: 'production' (user dashboard — production behavior only) or
// 'full' (admin dashboard — production + sandbox behavior side by side).
export default function ColumnGuideView({ scope }) {
  const showSandbox = scope === 'full'
  const rows = showSandbox ? COLUMNS : COLUMNS.filter((c) => !c.sandboxOnly)

  return (
    <>
      {showSandbox && (
        <div className="alert info">
          <Info size={17} />
          <span>
            <strong>scenario_id is sandbox-only.</strong> In production your invoices
            aren&apos;t tagged with a test scenario at all — FBR just receives the real sale
            details. Everything else in the CSV maps to what actually happened in the
            transaction, in both environments.
          </span>
        </div>
      )}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Required</th>
              <th>What it is</th>
              {showSandbox ? (
                <>
                  <th>In sandbox testing</th>
                  <th>In production</th>
                </>
              ) : (
                <th>In production</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                </td>
                <td>
                  {c.required ? (
                    <span className="badge failed">required</span>
                  ) : (
                    <span className="badge draft">optional</span>
                  )}
                </td>
                <td>{c.meaning}</td>
                {showSandbox && <td className="muted">{c.sandbox}</td>}
                <td className="muted">{c.production}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <BookOpenText size={17} /> Sale type reference
      </h2>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        Valid values for the <code>sale_type</code> column and what each one means. Pick whichever
        genuinely matches what you sold — most everyday sales are &quot;Goods at standard
        rate (default)&quot;.
      </p>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>sale_type value</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {SALE_TYPES.map(([name, desc]) => (
              <tr key={name}>
                <td>
                  <span className="strong">{name}</span>
                </td>
                <td className="muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert error" style={{ marginTop: '1.5rem' }}>
        <AlertTriangle size={17} />
        <span>
          <strong>Editing the CSV in Excel, Numbers, or Google Sheets?</strong> These apps
          silently reformat cells that &quot;look like&quot; dates, decimals, or percentages —
          e.g. <code>2026-08-17</code> → <code>8/17/2026</code>, <code>0101.2100</code> →{' '}
          <code>101.21</code>, <code>18%</code> → <code>0.18</code>. If an upload fails with an
          odd value mismatch, open the file in a plain text editor first to check for this before
          re-uploading.
        </span>
      </div>
    </>
  )
}
