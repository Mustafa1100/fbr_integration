import { useState } from 'react'
import RequestList from '../components/RequestList.jsx'

const TABS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

export default function Requests() {
  const [status, setStatus] = useState('pending')

  return (
    <div className="page">
      <h1>Item requests</h1>
      <p className="muted">
        Clients cannot change their item list themselves: every new item, change and deletion
        they ask for waits here for your approval. When approving a new item or a change you set
        its tax rate and PCT code. Their computer picks up your decision at its next refresh.
      </p>
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${status === tab.id ? 'active' : ''}`}
            onClick={() => setStatus(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="card table-card">
        <RequestList
          key={status}
          status={status}
          showClient
          emptyText={status === 'pending' ? 'No requests are waiting.' : 'None yet.'}
        />
      </div>
    </div>
  )
}
