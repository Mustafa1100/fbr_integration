import { useEffect, useState } from 'react'
import { api, formatDate } from '../api.js'

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [savedId, setSavedId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/plans').then(setPlans).catch((err) => setError(err.message))
  }, [])

  const edit = (id, patch) => {
    setSavedId(null)
    setPlans(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function save(plan) {
    setError('')
    try {
      const updated = await api.put(`/api/admin/plans/${plan.id}`, {
        name: plan.name,
        price: Number(plan.price) || 0,
      })
      setPlans(plans.map((p) => (p.id === plan.id ? updated : p)))
      setSavedId(plan.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <h1>Plans & pricing</h1>
      <p className="muted">
        The four packages a client can be given. A new price applies to plans assigned from now
        on; subscriptions already sold keep the price they were sold at.
      </p>
      {error && <div className="alert error">{error}</div>}
      <div className="plan-grid">
        {plans.map((plan) => (
          <form
            key={plan.id}
            className="card plan-card"
            onSubmit={(e) => {
              e.preventDefault()
              save(plan)
            }}
          >
            <div className="plan-months">
              {plan.months} {plan.months === 1 ? 'month' : 'months'}
            </div>
            <label>
              Name
              <input value={plan.name} onChange={(e) => edit(plan.id, { name: e.target.value })} required />
            </label>
            <label>
              Price (Rs)
              <input
                type="number"
                min="0"
                step="any"
                value={plan.price}
                onChange={(e) => edit(plan.id, { price: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="btn">
              {savedId === plan.id ? 'Saved' : 'Save'}
            </button>
            <div className="muted small">Last changed {formatDate(plan.updated_at)}</div>
          </form>
        ))}
      </div>
    </div>
  )
}
