import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
