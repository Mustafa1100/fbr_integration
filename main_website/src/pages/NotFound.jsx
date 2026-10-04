import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import mark from '../assets/mark.png'

export default function NotFound() {
  return (
    <section className="notfound">
      <div className="container">
        <img src={mark} alt="" className="notfound__mark" />
        <span className="eyebrow">Error 404</span>
        <h1 className="h1">
          This page isn’t <em>compliant</em>
        </h1>
        <p className="lead">The page you’re looking for doesn’t exist or has moved.</p>
        <Link to="/" className="btn btn--primary btn--lg">
          Back to home <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  )
}
