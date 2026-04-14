'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'success' | 'warning'
  isLoading?: boolean
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'danger',
  isLoading = false
}: ConfirmModalProps) {
  if (!isOpen) return null

  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          icon: <CheckCircle2 size={32} color="#10B981" />,
          buttonBg: '#10B981',
          buttonHover: '#059669',
          lightBg: '#ECFDF5'
        }
      case 'warning':
        return {
          icon: <AlertCircle size={32} color="#F59E0B" />,
          buttonBg: '#F59E0B',
          buttonHover: '#D97706',
          lightBg: '#FFFBEB'
        }
      default: // danger
        return {
          icon: <AlertCircle size={32} color="#EF4444" />,
          buttonBg: '#EF4444',
          buttonHover: '#DC2626',
          lightBg: '#FEF2F2'
        }
    }
  }

  const styles = getVariantStyles()

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      {/* Overlay */}
      <div 
        onClick={!isLoading ? onClose : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(45, 27, 14, 0.4)',
          backdropFilter: 'blur(8px)'
        }} 
      />

      {/* Modal Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '440px',
        background: '#fff',
        borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Close Button */}
        {!isLoading && (
          <button 
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--color-muted)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        )}

        {/* Icon Circle */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: styles.lightBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          {styles.icon}
        </div>

        {/* Content */}
        <h3 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 800, 
          color: '#2D1B0E', 
          marginBottom: '12px',
          margin: 0
        }}>
          {title}
        </h3>
        <p style={{ 
          fontSize: '0.95rem', 
          lineHeight: '1.5', 
          color: '#6B7280', 
          marginBottom: '32px',
          padding: '0 10px'
        }}>
          {message}
        </p>

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          width: '100%',
          flexDirection: window.innerWidth < 480 ? 'column-reverse' : 'row'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '14px',
              border: '1.5px solid var(--color-border)',
              background: '#fff',
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--color-text)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              background: styles.buttonBg,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: `0 4px 12px ${styles.buttonBg}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isLoading ? 'Chargement...' : confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body
  )
}
