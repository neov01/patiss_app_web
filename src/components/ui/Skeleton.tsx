'use client'

interface SkeletonProps {
  className?: string
  height?: string | number
  width?: string | number
  rounded?: boolean
}

export function Skeleton({ className, height, width, rounded = false }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['animate-pulse', className].filter(Boolean).join(' ')}
      style={{
        height,
        width,
        borderRadius: rounded ? '50%' : '8px',
        background: 'var(--color-surface-container-low, #e5e5e5)',
      }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }} aria-busy="true" aria-label="Chargement…">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="40%" />
    </div>
  )
}

export function SkeletonProductGrid({ count = 8 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }} aria-busy="true" aria-label="Chargement des produits…">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton height={80} />
          <Skeleton height={16} width="70%" />
          <Skeleton height={14} width="40%" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} aria-busy="true" aria-label="Chargement du tableau…">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--color-surface-container-low)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={14} width={j === 0 ? '70%' : '50%'} />
          ))}
        </div>
      ))}
    </div>
  )
}
