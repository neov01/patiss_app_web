'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { CumulativePoint } from '@/lib/domain/dashboard-metrics'

const DEFAULT_W = 640
const MIN_W = 240
const H = 220
const PAD = { top: 30, right: 16, bottom: 28, left: 56 }

function fmt(value: number) {
    return value.toLocaleString('fr-FR')
}

export default function CumulativeRevenueChart({ points, currency }: { points: CumulativePoint[]; currency: string }) {
    const [hovered, setHovered] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [W, setW] = useState(DEFAULT_W)

    // Dessiner à la largeur réelle : le texte garde sa taille sur mobile au lieu d'être réduit avec le SVG.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const observer = new ResizeObserver(entries => {
            const width = Math.round(entries[0]?.contentRect.width ?? DEFAULT_W)
            setW(Math.max(MIN_W, width))
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    const hourStep = W < 420 ? 6 : 3

    const todayPoints = points.filter(p => p.today !== null)
    const last = todayPoints[todayPoints.length - 1]
    const values = points.flatMap(p => (p.today === null ? [p.yesterday] : [p.today, p.yesterday]))
    const hi = Math.max(1, ...values)
    const lo = Math.min(0, ...values)
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const step = points.length > 1 ? innerW / (points.length - 1) : 0
    const x = (i: number) => PAD.left + i * step
    const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH

    const yesterdayPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.yesterday)}`).join(' ')
    const todayPath = points
        .map((p, i) => (p.today === null ? null : `${x(i)},${y(p.today)}`))
        .filter((s): s is string => s !== null)
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${s}`)
        .join(' ')
    const hasYesterday = points.some(p => p.yesterday !== 0)
    const lastIndex = last ? points.indexOf(last) : -1

    const onMove = (e: PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const svgX = ((e.clientX - rect.left) / rect.width) * W
        const index = step > 0 ? Math.round((svgX - PAD.left) / step) : 0
        setHovered(Math.max(0, Math.min(points.length - 1, index)))
    }

    const hp = hovered !== null ? points[hovered] : undefined
    const summary = last
        ? `CA cumulé : ${fmt(last.today ?? 0)} ${currency} à ${last.hour}h, contre ${fmt(last.yesterday)} ${currency} hier à la même heure`
        : 'CA cumulé : aucune donnée'

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--color-primary)" strokeWidth="3" /></svg>
                    Aujourd&apos;hui
                </span>
                {hasYesterday && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="3 3" /></svg>
                        Hier
                    </span>
                )}
            </div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                role="img"
                aria-label={summary}
                onPointerMove={onMove}
                onPointerLeave={() => setHovered(null)}
                style={{ display: 'block', touchAction: 'pan-y' }}
            >
                {[hi, (hi + lo) / 2, lo].map(v => (
                    <g key={v}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" />
                        <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" style={{ fontSize: '11px', fill: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(Math.round(v))}
                        </text>
                    </g>
                ))}
                {points.map((p, i) => (p.hour % hourStep === 0 ? (
                    <text key={p.hour} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--color-muted)' }}>{p.hour}h</text>
                ) : null))}
                {hasYesterday && (
                    <path d={yesterdayPath} fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="4 4" />
                )}
                {todayPath && <path d={todayPath} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {last && lastIndex >= 0 && (
                    <g>
                        <circle cx={x(lastIndex)} cy={y(last.today ?? 0)} r="5" fill="var(--color-primary)" stroke="white" strokeWidth="2" />
                        <text x={x(lastIndex)} y={y(last.today ?? 0) - 10} textAnchor={lastIndex > points.length * 0.8 ? 'end' : 'middle'} style={{ fontSize: '12px', fontWeight: 800, fill: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(last.today ?? 0)} {currency}
                        </text>
                    </g>
                )}
                {hp && hovered !== null && (
                    <line x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-text)" strokeOpacity="0.25" strokeWidth="1" />
                )}
            </svg>
            {hp && hovered !== null && (
                <div
                    role="status"
                    style={{
                        position: 'absolute', top: '28px',
                        left: `${(x(hovered) / W) * 100}%`,
                        transform: hovered > points.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
                        background: 'var(--color-text)', color: 'white', borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap', pointerEvents: 'none',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    <strong>{hp.hour}h</strong> · Aujourd&apos;hui : {hp.today === null ? '—' : `${fmt(hp.today)} ${currency}`} · Hier : {fmt(hp.yesterday)} {currency}
                </div>
            )}
            {!last || (last.today ?? 0) === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '8px 0 0' }}>Aucune vente pour le moment aujourd&apos;hui.</p>
            ) : null}
        </div>
    )
}
