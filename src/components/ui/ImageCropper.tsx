'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react'
import { getCroppedImg } from '@/lib/utils/crop-image'

interface ImageCropperProps {
  image: string
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
  aspect?: number
}

export default function ImageCropper({ 
  image, 
  onCropComplete, 
  onCancel, 
  aspect = 1 
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop)
  }

  const onZoomChange = (zoom: number) => {
    setZoom(zoom)
  }

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleConfirm = async () => {
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels)
      if (croppedBlob) {
        onCropComplete(croppedBlob)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      background: 'rgba(25, 12, 5, 0.9)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      flexDirection: 'column',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
        zIndex: 2001
      }}>
        <h3 style={{ margin: 0, color: '#fff', fontWeight: 800 }}>Recadrer la photo</h3>
        <button 
          onClick={onCancel} 
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '10px' }}
        >
          <X size={24} />
        </button>
      </div>

      {/* Main Cropper Area */}
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        overflow: 'hidden',
        background: '#000'
      }}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onCropComplete={onCropCompleteInternal}
          onZoomChange={onZoomChange}
        />
      </div>

      {/* Footer / Controls */}
      <div style={{ 
        padding: '32px 24px', 
        background: 'rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2001
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '400px' }}>
          <ZoomOut size={20} color="rgba(255,255,255,0.6)" />
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ 
              flex: 1, 
              accentColor: 'var(--color-rose-dark)',
              height: '6px',
              borderRadius: '3px'
            }}
          />
          <ZoomIn size={20} color="rgba(255,255,255,0.6)" />
        </div>

        <div style={{ display: 'flex', gap: '16px', width: '100%', maxWidth: '400px' }}>
          <button 
            onClick={onCancel} 
            className="btn-ghost" 
            style={{ 
              flex: 1, 
              color: '#fff', 
              borderColor: 'rgba(255,255,255,0.2)',
              height: '56px',
              borderRadius: '16px',
              fontWeight: 700
            }}
          >
            Annuler
          </button>
          <button 
            onClick={handleConfirm} 
            className="btn-primary" 
            style={{ 
              flex: 2, 
              height: '56px', 
              borderRadius: '16px', 
              fontWeight: 800,
              fontSize: '1rem',
              gap: '12px'
            }}
          >
            <Check size={20} /> Valider le recadrage
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(1.05); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
