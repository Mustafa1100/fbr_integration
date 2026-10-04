import { Link } from 'react-router-dom'
import mark from '../assets/mark.png'
import markReverse from '../assets/mark-reverse.png'

// variant="dark"  → for light backgrounds (green mark)
// variant="light" → for dark backgrounds (reversed mark)
export default function Logo({ variant = 'dark', className = '' }) {
  return (
    <Link
      to="/"
      className={`logo logo--${variant}${className ? ` ${className}` : ''}`}
      aria-label="Compliance Pakistan — home"
    >
      <img className="logo__mark" src={variant === 'light' ? markReverse : mark} alt="" />
      <span className="logo__word">
        Compliance<b>.pk</b>
      </span>
    </Link>
  )
}
