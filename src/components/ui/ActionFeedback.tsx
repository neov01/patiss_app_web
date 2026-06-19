'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { X, ChevronRight, AlertTriangle, TrendingUp } from 'lucide-react'

// Props for the centered overlay success modal
export interface ActionFeedbackModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    type?: 'simple' | 'summary'
    sessionData?: {
        closed_at?: string
        opened_at?: string
        total_cash?: number
        total_mobile_money?: number
        total_orders?: number
        metrics_snapshot?: {
            totalRevenue?: number
            totalCash?: number
            totalMobileMoney?: number
            totalEspeces?: number
            totalOrangeMoney?: number
            totalWave?: number
            totalMtnMomo?: number
            totalMoovMoney?: number
            totalAcomptes?: number
            totalSoldes?: number
            totalVentesDirectes?: number
            totalPending?: number
            totalOrders?: number
            completedOrders?: number
            alertItems?: Array<{ name: string; current_stock: number; alert_threshold: number; unit: string }>
        }
    }
    currency?: string
}

export type SessionFeedbackData = ActionFeedbackModalProps['sessionData'];

export function ActionFeedbackModal({ isOpen, onClose, title, description, type = 'simple', sessionData, currency = 'FCFA' }: ActionFeedbackModalProps) {
    if (!isOpen) return null

    const snapshot = sessionData?.metrics_snapshot

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}
        >
            {/* Backdrop Overlay with Blur */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={type === 'summary' ? onClose : undefined} // Allow closing summary by clicking backdrop
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(26, 28, 26, 0.45)',
                    backdropFilter: 'blur(12px)',
                }}
            />

            {/* Modal Dialog Card */}
            {type === 'simple' ? (
                // 1. SIMPLE CENTERED OVERLAY (Auto-closes, clean and punchy)
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 15 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 24 }}
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '380px',
                        background: 'var(--color-lift)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '36px 32px',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                    }}
                >
                    {/* Animated Checkmark */}
                    <div style={{ marginBottom: '20px' }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                            <motion.circle
                                cx="36"
                                cy="36"
                                r="32"
                                fill="var(--color-secondary-container)"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                            />
                            <motion.path
                                d="M24 37L31 44L48 27"
                                stroke="var(--color-success)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.15, duration: 0.35, ease: 'easeOut' }}
                            />
                        </svg>
                    </div>

                    {/* Title Message */}
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.4 }}>
                        {title}
                    </h3>
                    
                    {description && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                            {description}
                        </p>
                    )}
                </motion.div>
            ) : (
                // 2. DETAILED SUMMARY MODAL (e.g. Day Closure)
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 15 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '520px',
                        background: 'var(--color-lift)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '32px',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1,
                        maxHeight: '92vh',
                        overflowY: 'auto',
                    }}
                >
                    {/* Close button top right */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            background: 'var(--color-well)',
                            border: 'none',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--color-muted)',
                            transition: 'transform 0.15s, background-color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                        <X size={18} />
                    </button>

                    {/* Big Animated Success Icon */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', marginTop: '10px' }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                            <motion.circle
                                cx="36"
                                cy="36"
                                r="32"
                                fill="var(--color-secondary-container)"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                            />
                            <motion.path
                                d="M24 37L31 44L48 27"
                                stroke="var(--color-success)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
                            />
                        </svg>
                    </div>

                    {/* Heading */}
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text)' }}>
                            {title}
                        </h2>
                        {description && (
                            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                                {description}
                            </p>
                        )}
                    </div>

                    {/* Session Summary Panel */}
                    {snapshot && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.3 }}
                            style={{
                                background: 'var(--color-well)',
                                borderRadius: 'var(--radius-md)',
                                padding: '20px',
                                marginBottom: '28px',
                                border: '1px solid rgba(131, 116, 107, 0.1)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(131, 116, 107, 0.1)', paddingBottom: '10px' }}>
                                <TrendingUp size={16} color="var(--color-primary)" />
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)' }}>
                                    Résumé de la Journée
                                </span>
                            </div>

                            {/* Metrics Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>Chiffre d&apos;affaires</span>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-success)' }}>
                                        {(snapshot.totalRevenue ?? 0).toLocaleString('fr-FR')} {currency}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>Commandes Total</span>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                        {snapshot.totalOrders ?? 0}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid rgba(131, 116, 107, 0.08)', paddingTop: '10px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>Total Espèces</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                        {(snapshot.totalEspeces ?? 0).toLocaleString('fr-FR')} {currency}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid rgba(131, 116, 107, 0.08)', paddingTop: '10px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>Total Mobile Money</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                        {(snapshot.totalMobileMoney ?? 0).toLocaleString('fr-FR')} {currency}
                                    </span>
                                </div>
                            </div>

                            {/* Stock Warnings */}
                            {snapshot.alertItems && snapshot.alertItems.length > 0 && (
                                <div style={{ marginTop: '16px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '12px', padding: '12px', display: 'flex', gap: '10px' }}>
                                    <AlertTriangle size={16} color="var(--color-error)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 800, color: '#991B1B' }}>
                                            Alerte stocks bas ({snapshot.alertItems.length} ingrédient{snapshot.alertItems.length > 1 ? 's' : ''})
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#B91C1C', lineHeight: 1.4 }}>
                                            {snapshot.alertItems.slice(0, 3).map(i => `${i.name} (${i.current_stock}${i.unit || ''})`).join(', ')}
                                            {snapshot.alertItems.length > 3 ? '...' : ''}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Primary action button */}
                    <button
                        onClick={onClose}
                        className="btn-primary"
                        style={{
                            width: '100%',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                        }}
                    >
                        <span>Fermer le résumé</span>
                        <ChevronRight size={18} />
                    </button>
                </motion.div>
            )}
        </div>
    )
}
