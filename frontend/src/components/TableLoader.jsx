import { Loader2 } from 'lucide-react'

export default function TableLoader({ label = 'data' }) {
  return (
    <div className="table-card">
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading {label}…
      </div>
    </div>
  )
}
