import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

// Full FBR HS-code list is fetched once (browser-side cache across mounts)
// and filtered client-side as the user types — the backend already caches
// the upstream FBR call for 24h, this just avoids refetching per keystroke.
let cachedCodes = null
let cachedPromise = null

function loadHsCodes() {
  if (cachedCodes) return Promise.resolve(cachedCodes)
  if (!cachedPromise) {
    cachedPromise = api.get('/api/reference/hs-codes').then((data) => {
      cachedCodes = data.map((c) => ({ code: c.hS_CODE, description: c.description }))
      return cachedCodes
    })
  }
  return cachedPromise
}

// Free-text HS code field with a type-ahead dropdown backed by FBR's own
// registered code list (GET /api/reference/hs-codes — the same list PRAL's
// DI validator checks against). Search by code or product description;
// click a match to fill it in, or just type a known code directly.
export default function HsCodePicker({ value, onChange, required }) {
  const [codes, setCodes] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    loadHsCodes().then(setCodes).catch(() => {})
  }, [])

  useEffect(() => {
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return codes
      .filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .slice(0, 25)
  }, [value, codes])

  return (
    <div className="hs-picker" ref={wrapRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by product or code, e.g. tea, 0902.3000"
        autoComplete="off"
        required={required}
      />
      {open && matches.length > 0 && (
        <div className="hs-picker-menu">
          {matches.map((c) => (
            <button
              type="button"
              key={c.code}
              className="hs-picker-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c.code)
                setOpen(false)
              }}
            >
              <span className="hs-picker-code">{c.code}</span>
              <span className="hs-picker-desc">{c.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
