import { useParams } from 'react-router-dom'
import ReceiptView from '../../components/ReceiptView'

export default function Receipt() {
  const { id } = useParams()
  return (
    <ReceiptView
      apiUrl={`/api/invoices/${id}`}
      backTo="/invoices"
      backLabel="Back to invoices"
      allowMarkPaid
    />
  )
}
