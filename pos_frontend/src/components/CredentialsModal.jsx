import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Modal from './Modal.jsx'

// Shows a freshly generated desktop login. The password is stored hashed, so
// this is the only time it can be read — hence no close button, just an
// explicit "I have saved it".
export default function CredentialsModal({ title, username, password, onDone }) {
  const [copied, setCopied] = useState('')

  async function copy(label, text) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
  }

  const both = `Username: ${username}\nPassword: ${password}`
  const rows = [
    ['Username', username],
    ['Password', password],
  ]

  return (
    <Modal title={title}>
      <div className="alert warn">
        Copy the password now. It is not stored in readable form and cannot be shown again; if it
        is lost, use Reset password to issue a new one.
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="credential">
          <div>
            <div className="credential-label">{label}</div>
            <div className="credential-value mono">{value}</div>
          </div>
          <button type="button" className="btn ghost small" onClick={() => copy(label, value)}>
            {copied === label ? <Check size={15} /> : <Copy size={15} />}
            {copied === label ? 'Copied' : 'Copy'}
          </button>
        </div>
      ))}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={() => copy('both', both)}>
          {copied === 'both' ? <Check size={15} /> : <Copy size={15} />}
          {copied === 'both' ? 'Copied' : 'Copy both'}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          I have saved it
        </button>
      </div>
    </Modal>
  )
}
