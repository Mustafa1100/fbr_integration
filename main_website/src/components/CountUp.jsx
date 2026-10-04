import { useEffect, useState } from 'react'
import useInView from '../hooks/useInView'

// Counts from 0 to `to` the first time it scrolls into view.
export default function CountUp({ to, duration = 1400, prefix = '', suffix = '' }) {
  const [ref, seen] = useInView({ threshold: 0.5 })
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!seen) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setN(to)
      return undefined
    }
    let raf
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to, duration])

  return (
    <span ref={ref}>
      {prefix}
      {n}
      {suffix}
    </span>
  )
}
