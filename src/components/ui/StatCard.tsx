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
    icon: Icon, iconColor = 'var(--color-primary)', onClick, loading, accent = 'var(--color-primary)',
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
    
    // Semantic colors for badges
    const badgeBg = trend === 'up' ? 'var(--color-secondary-container)' : trend === 'down' ? 'var(--color-error-container)' : 'var(--color-surface-container-high)'
    const badgeText = trend === 'up' ? 'var(--color-on-secondary-container)' : trend === 'down' ? 'var(--color-on-error-container)' : 'var(--color-on-surface-variant)'

    return (
        <div
            className={`card ${onClick ? 'card-clickable' : ''} ${className || ''}`}
            onClick={onClick}
            style={{ 
                cursor: onClick ? 'pointer' : 'default', 
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--color-surface-container-lowest)',
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
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-outline)', marginBottom: '4px', textTransform: 'none' }}>
                    {title}
                </p>
                <h3 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2 }}>
                    {value}
                </h3>
                {subtitle && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '8px' }}>
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Accent blob */}
            <div style={{ 
                position: 'absolute', 
                bottom: '-16px', 
                right: '-16px', 
                width: '96px', 
                height: '96px', 
                background: `${accent}08`, 
                borderRadius: '50%',
                filter: 'blur(32px)',
                transition: 'background 0.3s'
            }} className="accent-blob" />
        </div>
    )
}
