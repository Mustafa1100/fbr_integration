import { useState } from 'react'
import { BookOpenText, Download } from 'lucide-react'
import ColumnGuideView from '../../components/ColumnGuideView'
import usePageTitle from '../../hooks/usePageTitle'
import { COLUMN_GUIDE_TEXT } from '../../data/columnGuide'

export default function ColumnGuide() {
  usePageTitle('Column Guide')
  const [lang, setLang] = useState('en')
  const { ui } = COLUMN_GUIDE_TEXT[lang]
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BookOpenText size={22} /> {ui.title}
          </h1>
          <p className="page-sub">{ui.subtitleUser}</p>
        </div>
        <div className="page-actions no-print">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Download size={16} /> {ui.downloadPdf}
          </button>
        </div>
      </div>
      <ColumnGuideView scope="production" lang={lang} onLangChange={setLang} />
    </>
  )
}
