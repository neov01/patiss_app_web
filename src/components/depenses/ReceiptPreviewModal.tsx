'use client'

import { X, ExternalLink } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  receiptUrl: string | null
}

export default function ReceiptPreviewModal({
  isOpen,
  onClose,
  receiptUrl,
}: Props) {
  if (!isOpen || !receiptUrl) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          maxWidth: '540px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
        className="flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(131,116,107,0.15)] bg-[var(--color-caisse-bg)]">
          <h3 className="text-base font-bold text-[color:var(--color-text)] font-display">
            Justificatif de dépense
          </h3>
          <div className="flex items-center gap-1">
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] rounded-full hover:bg-[var(--color-well)]"
              title="Ouvrir en taille réelle"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] rounded-full hover:bg-[var(--color-well)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 bg-[var(--color-well)] flex items-center justify-center max-h-[75vh] overflow-auto">
          <img
            src={receiptUrl}
            alt="Ticket de caisse"
            className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm"
          />
        </div>

        <div className="p-3 bg-[#FFFFFF] text-center border-t border-[rgba(131,116,107,0.1)]">
          <button
            onClick={onClose}
            style={{
              height: '40px',
              borderRadius: '9999px',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              border: 'none',
              padding: '0 24px',
            }}
            className="text-xs font-bold shadow-xs hover:bg-[var(--color-primary-container)] transition-colors"
          >
            Fermer l'aperçu
          </button>
        </div>
      </div>
    </div>
  )
}
