import { BookOpenText } from 'lucide-react'
import ColumnGuideView from '../../components/ColumnGuideView'
import usePageTitle from '../../hooks/usePageTitle'

export default function AdminColumnGuide() {
  usePageTitle('Column Guide')
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BookOpenText size={22} /> Column Guide
          </h1>
          <p className="page-sub">
            What every column in the upload file means — covering both sandbox scenario testing
            and real production invoices, since you manage the whole rollout for each business.
          </p>
        </div>
      </div>
      <ColumnGuideView scope="full" />
    </>
  )
}
