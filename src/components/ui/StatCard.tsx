import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
    title: string
    value: string | number
    subtitle?: string
    trend?: 'up' | 'down' | 'neutral'
    trendLabel?: string
    icon?: LucideIcon
    iconColor?: string
    onClick?: () => void
    loading?: boolean
    accent?: string
}

export default function StatCard({
    title, value, subtitle, trend, trendLabel,
    icon: Icon, iconColor = '#C4836A', onClick, loading, accent = '#E8B4A0',
}: StatCardProps) {
    if (loading) {
        return (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="skeleton" style={{ height: '14px', width: '60%' }} />
                <div className="skeleton" style={{ height: '32px', width: '80%' }} />
                <div className="skeleton" style={{ height: '12px', width: '40%' }} />
            </div>
        )
    }

    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
    const trendColor = trend === 'up' ? '#4C9E6A' : trend === 'down' ? '#D94F38' : '#9C8070'

    return (
        <div
            className={`card${onClick ? ' card-clickable' : ''}`}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {title}
                </span>
                {Icon && (
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: accent + '40',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Icon size={18} style={{ color: iconColor }} />
                    </div>
                )}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, marginBottom: '8px' }}>
                {value}
            </div>
            {(subtitle || trend) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {trend && (
                        <TrendIcon size={14} style={{ color: trendColor }} />
                    )}
                    {trendLabel && (
                        <span style={{ fontSize: '0.75rem', color: trendColor, fontWeight: 600 }}>{trendLabel}</span>
                    )}
                    {subtitle && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{subtitle}</span>
                    )}
                </div>
            )}
        </div>
    )
}
