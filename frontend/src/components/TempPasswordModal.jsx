import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Modal from './Modal'

// Shows a freshly generated temporary password once — after creating an
// account (mode "created") or resetting its password (mode "reset").
export default function TempPasswordModal({ account, label = 'User', onClose }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(account.temp_password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    // If the browser denies clipboard access, the code is still fully
    // visible and selectable in the box — nothing else to fall back to.
  }

  return (
    <Modal title={account.mode === 'reset' ? 'Password reset' : `${label} created`} onClose={onClose} width={420}>
      <p className="muted" style={{ margin: '0 0 16px' }}>
        {account.mode === 'reset' ? (
          <>
            New temporary password for <strong>{account.email}</strong> — their old session is already
            signed out, and they'll be required to set their own password on next sign-in.
          </>
        ) : (
          <>
            Share this temporary password with <strong>{account.email}</strong> — they'll be required
            to set their own on first sign-in.
          </>
        )}{' '}
        It won&apos;t be shown again.
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          borderRadius: 10,
          background: 'var(--slate-50)',
          border: '1px solid var(--border-strong)',
          marginBottom: 18,
        }}
      >
        <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.12em' }}>
          {account.temp_password}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          {copied ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            <>
              <Copy size={14} /> Copy
            </>
          )}
        </button>
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
        Done
      </button>
    </Modal>
  )
}
