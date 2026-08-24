import { BookOpenText, Info, AlertTriangle } from 'lucide-react'
import { LANGUAGES, COLUMN_META, SALE_TYPE_VALUES, COLUMN_GUIDE_TEXT } from '../data/columnGuide'

// scope: 'production' (user dashboard — production behavior only) or
// 'full' (admin dashboard — production + sandbox behavior side by side).
export default function ColumnGuideView({ scope, lang, onLangChange }) {
  const showSandbox = scope === 'full'
  const rows = showSandbox ? COLUMN_META : COLUMN_META.filter((c) => !c.sandboxOnly)
  const { ui, columns, saleTypes } = COLUMN_GUIDE_TEXT[lang]
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir || 'ltr'

  return (
    <div dir={dir} lang={lang}>
      <div className="row-actions no-print" style={{ gap: 6, marginBottom: '1.25rem' }}>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {ui.language}:
        </span>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            className={`btn btn-sm ${lang === l.code ? 'btn-primary' : 'btn-secondary'}`}
            style={{ minWidth: 84, height: 27, lineHeight: 1 }}
            onClick={() => onLangChange(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {showSandbox && (
        <div className="alert info">
          <Info size={17} />
          <span>
            <strong>{ui.sandboxNoteStrong}</strong> {ui.sandboxNoteRest}
          </span>
        </div>
      )}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>{ui.colColumn}</th>
              <th>{ui.colRequired}</th>
              <th>{ui.colWhatItIs}</th>
              {showSandbox ? (
                <>
                  <th>{ui.colInSandbox}</th>
                  <th>{ui.colInProduction}</th>
                </>
              ) : (
                <th>{ui.colInProduction}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name}>
                <td>
                  <bdi dir="ltr">
                    <code>{c.name}</code>
                  </bdi>
                </td>
                <td>
                  {c.required ? (
                    <span className="badge failed">{ui.badgeRequired}</span>
                  ) : (
                    <span className="badge draft">{ui.badgeOptional}</span>
                  )}
                </td>
                <td>{columns[c.name].meaning}</td>
                {showSandbox && <td className="muted">{columns[c.name].sandbox}</td>}
                <td className="muted">{columns[c.name].production}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <BookOpenText size={17} /> {ui.saleTypeSectionTitle}
      </h2>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        {ui.saleTypeIntro}
      </p>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>{ui.colSaleTypeValue}</th>
              <th>{ui.colMeaning}</th>
            </tr>
          </thead>
          <tbody>
            {SALE_TYPE_VALUES.map((name) => (
              <tr key={name}>
                <td>
                  <bdi dir="ltr">
                    <span className="strong">{name}</span>
                  </bdi>
                </td>
                <td className="muted">{saleTypes[name]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert error" style={{ marginTop: '1.5rem' }}>
        <AlertTriangle size={17} />
        <span>
          <strong>{ui.warningStrong}</strong> {ui.warningRest}
        </span>
      </div>
    </div>
  )
}
