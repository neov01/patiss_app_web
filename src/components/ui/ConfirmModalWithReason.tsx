'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, X } from 'lucide-react'
import { isValidDeletionReason } from '@/lib/domain/order-deletion'

interface ConfirmModalWithReasonProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  title: string
  message: string
  reasonLabel?: string
  reasonPlaceholder?: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
}

export default function ConfirmModalWithReason({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  reasonLabel = 'Commentaire (obligatoire)',
  reasonPlaceholder = 'Expliquez la raison de cette action…',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  isLoading = false
}: ConfirmModalWithReasonProps) {
  const [reason, setReason] = useState('')

  if (!isOpen) return null

  const canConfirm = isValidDeletionReason(reason) && !isLoading

  const handleClose = () => {
    setReason('')
    onClose()
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(reason.trim())
    setReason('')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div
        onClick={!isLoading ? handleClose : undefined}
        style={{ position: 'absolute', inset: 0, background: 'rgba(45, 27, 14, 0.4)', backdropFilter: 'blur(8px)' }}
      />
      <div style={{
        position: 'relative', width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', padding: '32px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center'
      }}>
        {!isLoading && (
          <button
            onClick={handleClose}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', padding: '8px',
              cursor: 'pointer', color: 'var(--color-muted)', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        )}

        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', background: '#FEF2F2', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: '20px'
        }}>
          <AlertCircle size={32} color="#EF4444" />
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '12px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#6B7280', marginBottom: '20px', padding: '0 10px' }}>
          {message}
        </p>

        <div style={{ width: '100%', textAlign: 'left', marginBottom: '24px' }}>
          <label htmlFor="confirm-modal-reason" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: '8px' }}>
            {reasonLabel}
          </label>
          <textarea
            id="confirm-modal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            disabled={isLoading}
            rows={3}
            style={{
              width: '100%', borderRadius: '12px', border: '1.5px solid var(--color-border)', padding: '10px 12px',
              fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              flex: 1, padding: '14px', borderRadius: '14px', border: '1.5px solid var(--color-border)',
              background: '#fff', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: '#EF4444',
              fontSize: '0.95rem', fontWeight: 700, color: '#fff',
              cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.6
            }}
          >
            {isLoading ? 'Chargement...' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
