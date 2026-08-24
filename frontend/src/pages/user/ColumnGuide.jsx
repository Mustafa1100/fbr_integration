import { BookOpenText } from 'lucide-react'
import ColumnGuideView from '../../components/ColumnGuideView'
import usePageTitle from '../../hooks/usePageTitle'

export default function ColumnGuide() {
  usePageTitle('Column Guide')
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BookOpenText size={22} /> Column Guide
          </h1>
          <p className="page-sub">
            What every column in the upload file means for a real sale — this is your production
            reference, for the invoices you upload every day.
          </p>
        </div>
      </div>
      <ColumnGuideView scope="production" />
    </>
  )
}
