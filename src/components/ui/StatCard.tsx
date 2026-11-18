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
    style?: React.CSSProperties
    className?: string
}

export default function StatCard({
    title, value, subtitle, trend, trendLabel,
    icon: Icon, iconColor = 'var(--color-primary)', onClick, loading,
    style, className,
}: StatCardProps) {
    if (loading) {
        return (
            <div className={`card ${className || ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', ...style }}>
                <div className="skeleton" style={{ height: '18px', width: '40%' }} />
                <div className="skeleton" style={{ height: '36px', width: '70%' }} />
                <div className="skeleton" style={{ height: '14px', width: '50%' }} />
            </div>
        )
    }

    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
    
    // Couleurs sémantiques des badges (tokens définis dans globals.css)
    const badgeBg = trend === 'up' ? 'var(--color-badge-success-bg)' : trend === 'down' ? 'var(--color-badge-danger-bg)' : 'var(--color-well)'
    const badgeText = trend === 'up' ? 'var(--color-badge-success-text)' : trend === 'down' ? 'var(--color-badge-danger-text)' : 'var(--color-muted)'

    return (
        <div
            className={`card ${onClick ? 'card-clickable' : ''} ${className || ''}`}
            onClick={onClick}
            style={{ 
                cursor: onClick ? 'pointer' : 'default', 
                padding: '24px',
                position: 'relative',
                background: 'var(--color-lift)',
                border: 'none',
                ...style 
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
                {Icon && (
                    <Icon size={28} style={{ color: iconColor }} />
                )}
                {trend && (
                    <div style={{ 
                        background: badgeBg, 
                        color: badgeText, 
                        fontSize: '10px', 
                        fontWeight: 800, 
                        padding: '4px 10px', 
                        borderRadius: '9999px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <TrendIcon size={10} strokeWidth={3} />
                        {trendLabel}
                    </div>
                )}
            </div>
            
            <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '4px', textTransform: 'none' }}>
                    {title}
                </p>
                <h3 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                </h3>
                {subtitle && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '8px' }}>
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    )
}
