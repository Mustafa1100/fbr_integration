import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function Modal({ title, onClose, children, width = 480 }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      // With a pop-up open on top of another (e.g. a calculator over a
      // form), Escape closes only the top one.
      const overlays = document.querySelectorAll('.modal-overlay')
      if (overlays[overlays.length - 1] === overlayRef.current) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
