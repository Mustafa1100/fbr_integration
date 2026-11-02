import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import logoLight from '../assets/logo-light.png'

// variant="dark"  → for light backgrounds (green wordmark)
// variant="light" → for dark backgrounds (white wordmark)
export default function Logo({ variant = 'dark', className = '' }) {
  return (
    <Link
      to="/"
      className={`logo logo--${variant}${className ? ` ${className}` : ''}`}
      aria-label="Compliance Pakistan — home"
    >
      <img
        className="logo__img"
        src={variant === 'light' ? logoLight : logo}
        alt="Compliance Pakistan"
        width="630"
        height="180"
      />
    </Link>
  )
}
