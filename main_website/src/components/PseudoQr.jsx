import { useMemo } from 'react'

// Decorative QR-style pattern for the sample receipts (not a scannable code).
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export default function PseudoQr({ size = 88, seed = 7, color = '#0c1f17' }) {
  const N = 21
  const cells = useMemo(() => {
    const rand = rng(seed)
    const inFinder = (x, y) =>
      (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9)
    const out = []
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!inFinder(x, y) && rand() > 0.52) out.push([x, y])
      }
    }
    return out
  }, [seed])

  const finder = (x, y) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" fill={color} />
      <rect x="1" y="1" width="5" height="5" fill="#fff" />
      <rect x="2" y="2" width="3" height="3" fill={color} />
    </g>
  )

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${N} ${N}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Sample QR code"
    >
      <rect width={N} height={N} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />
      ))}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
  )
}
