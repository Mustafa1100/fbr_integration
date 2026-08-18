import { useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import ReceiptView from '../../components/ReceiptView'

export default function UserInvoiceDetail() {
  const { userId, invoiceId } = useParams()
  return (
    <ReceiptView
      apiUrl={`/api/admin/users/${userId}/invoices/${invoiceId}`}
      backTo={`/admin/invoices?user=${userId}`}
      backLabel="Back to invoices"
      banner={
        <div className="alert info no-print">
          <ShieldCheck size={17} />
          <span>Viewing as admin — read-only.</span>
        </div>
      }
    />
  )
}
