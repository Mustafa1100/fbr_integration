import { useState } from 'react'
import { Plus } from 'lucide-react'

export default function Faq({ items }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="faq">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q} className={`faq__item${isOpen ? ' is-open' : ''}`}>
            <h3>
              <button
                type="button"
                className="faq__q"
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span>{item.q}</span>
                <Plus size={20} aria-hidden="true" />
              </button>
            </h3>
            <div id={`faq-a-${i}`} className="faq__a" role="region">
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
